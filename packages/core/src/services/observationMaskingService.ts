/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import { logObservationMasking } from '../telemetry/loggers.js';
import {
  SHELL_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { ObservationMaskingEvent } from '../telemetry/types.js';

export const TOOL_PROTECTION_THRESHOLD = 50_000;
export const HYSTERESIS_THRESHOLD = 30_000;
export const PROTECT_LATEST_TURN = true;

export const OBSERVATION_DIR = 'observations';

export interface MaskingResult {
  newHistory: Content[];
  maskedCount: number;
  tokensSaved: number;
}

/**
 * Service to manage context window by masking bulky tool outputs (Observation Masking).
 * Follows a Hybrid Backward Scanned FIFO algorithm:
 * 1. Protect newest 50k tool tokens (optionally skipping the entire latest turn).
 * 2. Identify ALL tool outputs beyond the protection window for global aggregation.
 * 3. Trigger masking if the total prunable tokens exceed 30k.
 */
export class ObservationMaskingService {
  async mask(history: Content[], config: Config): Promise<MaskingResult> {
    if (history.length === 0) {
      return { newHistory: history, maskedCount: 0, tokensSaved: 0 };
    }

    let cumulativeToolTokens = 0;
    let protectionBoundaryReached = false;
    let totalPrunableTokens = 0;

    const prunableParts: Array<{
      contentIndex: number;
      partIndex: number;
      tokens: number;
      content: string;
      originalPart: Part;
    }> = [];

    // Decide where to start scanning.
    // If PROTECT_LATEST_TURN is true, we skip the most recent message (index history.length - 1).
    const scanStartIdx = PROTECT_LATEST_TURN
      ? history.length - 2
      : history.length - 1;

    // Step 1: Backward scan to identify prunable tool outputs
    for (let i = scanStartIdx; i >= 0; i--) {
      const content = history[i];
      const parts = content.parts || [];

      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];

        // We only care about tool responses (observations)
        if (!part.functionResponse) continue;

        const observationContent = this.getObservationContent(part);
        if (!observationContent || this.isAlreadyMasked(observationContent)) {
          continue;
        }

        const partTokens = estimateTokenCountSync([part]);

        if (!protectionBoundaryReached) {
          cumulativeToolTokens += partTokens;
          if (cumulativeToolTokens > TOOL_PROTECTION_THRESHOLD) {
            protectionBoundaryReached = true;
            // The part that crossed the boundary is prunable.
            totalPrunableTokens += partTokens;
            prunableParts.push({
              contentIndex: i,
              partIndex: j,
              tokens: partTokens,
              content: observationContent,
              originalPart: part,
            });
          }
        } else {
          totalPrunableTokens += partTokens;
          prunableParts.push({
            contentIndex: i,
            partIndex: j,
            tokens: partTokens,
            content: observationContent,
            originalPart: part,
          });
        }
      }
    }

    // Step 2: Hysteresis trigger
    if (totalPrunableTokens < HYSTERESIS_THRESHOLD) {
      return { newHistory: history, maskedCount: 0, tokensSaved: 0 };
    }

    debugLogger.log(
      `[ObservationMasking] Triggering masking. Prunable tool tokens: ${totalPrunableTokens.toLocaleString()} (> ${HYSTERESIS_THRESHOLD.toLocaleString()})`,
    );

    // Step 3: Perform masking and offloading
    const newHistory = [...history]; // Shallow copy of history
    let actualTokensSaved = 0;
    const observationDir = path.join(
      config.storage.getHistoryDir(),
      OBSERVATION_DIR,
    );
    await fsPromises.mkdir(observationDir, { recursive: true });

    for (const item of prunableParts) {
      const { contentIndex, partIndex, content, tokens } = item;
      const contentRecord = newHistory[contentIndex];
      const part = contentRecord.parts![partIndex];

      if (!part.functionResponse) continue;

      const toolName = part.functionResponse.name || 'unknown_tool';
      const callId = part.functionResponse.id || Date.now().toString();
      const fileName = `${toolName}_${callId}_${Math.random()
        .toString(36)
        .substring(7)}.txt`;
      const filePath = path.join(observationDir, fileName);

      await fsPromises.writeFile(filePath, content, 'utf-8');

      const originalResponse =
        (part.functionResponse.response as Record<string, unknown>) || {};

      const totalLines = content.split('\n').length;
      const fileSizeMB = (
        Buffer.byteLength(content, 'utf8') /
        1024 /
        1024
      ).toFixed(2);

      let preview = '';
      if (toolName === SHELL_TOOL_NAME) {
        preview = this.formatShellPreview(originalResponse);
      } else {
        // General tools: Head + Tail preview (250 chars each)
        if (content.length > 500) {
          preview = `${content.slice(0, 250)}\n... [TRUNCATED] ...\n${content.slice(-250)}`;
        } else {
          preview = content;
        }
      }

      const maskedSnippet = this.formatMaskedSnippet({
        toolName,
        filePath,
        fileSizeMB,
        totalLines,
        tokens,
        preview,
      });

      // Create new part with masked content
      const newParts = [...contentRecord.parts!];

      // Replace the entire response with the masked snippet to guarantee full savings
      newParts[partIndex] = {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: { output: maskedSnippet },
        },
      };

      newHistory[contentIndex] = { ...contentRecord, parts: newParts };
      const newTaskTokens = estimateTokenCountSync([newParts[partIndex]]);
      actualTokensSaved += tokens - newTaskTokens;
    }

    debugLogger.log(
      `[ObservationMasking] Masked ${prunableParts.length} tool outputs. Saved ~${actualTokensSaved.toLocaleString()} tokens.`,
    );

    const result = {
      newHistory,
      maskedCount: prunableParts.length,
      tokensSaved: actualTokensSaved,
    };

    if (actualTokensSaved <= 0) {
      return result;
    }

    logObservationMasking(
      config,
      new ObservationMaskingEvent({
        tokens_before: totalPrunableTokens,
        tokens_after: totalPrunableTokens - actualTokensSaved,
        masked_count: prunableParts.length,
        total_prunable_tokens: totalPrunableTokens,
      }),
    );

    return result;
  }

  private getObservationContent(part: Part): string | null {
    if (!part.functionResponse) return null;
    const response = part.functionResponse.response as Record<string, unknown>;
    if (!response) return null;

    // Stringify the entire response for saving.
    // This handles any tool output schema automatically.
    const content = JSON.stringify(response, null, 2);

    // Multimodal safety check: Sibling parts (inlineData, etc.) are handled by mask()
    // by keeping the original part structure and only replacing the functionResponse content.

    return content;
  }

  private isAlreadyMasked(content: string): boolean {
    return content.includes('<observation_masked_guidance');
  }

  private formatShellPreview(response: Record<string, unknown>): string {
    const output = response['output'] || response['stdout'] || '';
    const content =
      typeof output === 'string' ? output : JSON.stringify(output);
    const lines = content.split('\n');
    let preview = lines.slice(0, 3).join('\n');

    const exitCode = response['exitCode'] ?? response['exit_code'];
    const error = response['error'];

    if (exitCode !== undefined && exitCode !== 0 && exitCode !== null) {
      preview += `\n[Exit Code: ${exitCode}]`;
    }
    if (error) {
      preview += `\n[Error: ${error}]`;
    }
    return preview;
  }

  private formatMaskedSnippet(params: MaskedSnippetParams): string {
    const { toolName, filePath, fileSizeMB, totalLines, tokens, preview } =
      params;
    return `[Observation Masked]
<observation_masked_guidance tool_name="${toolName}">
  <preview>${preview}</preview>
  <details>
    <file_path>${filePath}</file_path>
    <file_size>${fileSizeMB}MB</file_size>
    <line_count>${totalLines.toLocaleString()}</line_count>
    <estimated_total_tokens>${tokens.toLocaleString()}</estimated_total_tokens>
  </details>
  <instructions>
    The full output is available at the path above. 
    You can inspect it using tools like '${GREP_TOOL_NAME}' or '${READ_FILE_TOOL_NAME}'.
    Note: Reading the full file will use approximately ${tokens.toLocaleString()} tokens.
  </instructions>
</observation_masked_guidance>`;
  }
}

interface MaskedSnippetParams {
  toolName: string;
  filePath: string;
  fileSizeMB: string;
  totalLines: number;
  tokens: number;
  preview: string;
}
