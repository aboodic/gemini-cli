/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { describe, it, vi, beforeEach } from 'vitest';
import {
  ChatCompressionService,
  COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET,
} from '../services/chatCompressionService.js';
import { tokenLimit } from '../core/tokenLimits.js';
import type { GeminiChat } from '../core/geminiChat.js';
import type { Config } from '../config/config.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from '../utils/fileUtils.js';
import { getInitialChatHistory } from '../utils/environmentContext.js';
import {
  estimateTokenCountSync,
  calculateRequestTokenCount,
} from '../utils/tokenCalculation.js';

vi.mock('../core/tokenLimits.js');
vi.mock('../utils/environmentContext.js');
vi.mock('../utils/tokenCalculation.js');
vi.mock('../utils/fileUtils.js', () => ({
  saveTruncatedToolOutput: vi.fn(),
  formatTruncatedToolOutput: vi.fn(),
}));

/**
 * VALIDATION RUNTHROUGH
 *
 * Run this with: npx vitest packages/core/src/examples/validate_compression.test.ts --run
 */
describe('Compression Truncation Walkthrough', () => {
  let service: ChatCompressionService;
  let mockChat: GeminiChat;
  let mockConfig: Config;
  const mockModel = 'gemini-2.5-pro';

  beforeEach(() => {
    service = new ChatCompressionService();
    mockChat = {
      getHistory: vi.fn(),
      getLastPromptTokenCount: vi.fn().mockReturnValue(800),
    } as unknown as GeminiChat;

    mockConfig = {
      getCompressionThreshold: vi.fn().mockResolvedValue(0.5),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '<state_snapshot>Summarized history...</state_snapshot>',
                  },
                ],
              },
            },
          ],
        }),
      }),
      getContentGenerator: vi.fn().mockReturnValue({}),
      getHookSystem: () => undefined,
      getNextCompressionTruncationId: vi.fn().mockReturnValue(1),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
      getSessionId: vi.fn().mockReturnValue('test-session'),
      isInteractive: vi.fn().mockReturnValue(false),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-cli-test'),
      },
    } as unknown as Config;

    vi.mocked(tokenLimit).mockReturnValue(1000);
    vi.mocked(getInitialChatHistory).mockImplementation(
      async (_, h) => h || [],
    );
    vi.mocked(calculateRequestTokenCount).mockResolvedValue(100);

    // Mock save to return a predictable path
    vi.mocked(saveTruncatedToolOutput).mockImplementation(
      async (content, tool, id, dir) => ({
        outputFile: `${dir}/${tool}_${id}.txt`,
        totalLines: content.split('\n').length,
      }),
    );

    // Mock format to just return a string that we can check
    vi.mocked(formatTruncatedToolOutput).mockImplementation(
      (content, outputFile) =>
        `Output too large... For full output see: ${outputFile}\n...\n${content.slice(-100)}`,
    );
  });

  it('Scenario 1: Large Multi-line Output (Standard Grep)', async () => {
    console.log('\n--- SCENARIO 1: Standard Multi-line Truncation ---');
    const largeGrep = 'line\n'.repeat(100); // 100 lines
    const history = [
      { role: 'user', parts: [{ text: 'Older message 1' }] },
      { role: 'model', parts: [{ text: 'Older response 1' }] },
      { role: 'user', parts: [{ text: 'Older message 2' }] },
      { role: 'model', parts: [{ text: 'Older response 2' }] },
      // Preserved history (last 30%)
      { role: 'user', parts: [{ text: 'Grep something' }] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'grep',
              response: { content: largeGrep },
            },
          },
        ],
      },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    // Force this one to exceed budget
    vi.mocked(estimateTokenCountSync).mockReturnValue(
      COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET + 1,
    );

    const result = await service.compress(
      mockChat,
      'id',
      true,
      mockModel,
      mockConfig,
      false,
    );

    const keptHistory = result.newHistory!.slice(2);
    const grepPart = keptHistory.find((h) =>
      h.parts?.some((p) => p.functionResponse?.name === 'grep'),
    );
    console.log('LLM Sees:');
    console.log(grepPart?.parts?.[0]?.functionResponse?.response?.['content']);
  });

  it('Scenario 2: Elephant Line (Massive single string inside JSON)', async () => {
    console.log('\n--- SCENARIO 2: Elephant Line (Wide Truncation) ---');
    const massiveLine = 'a'.repeat(5000);
    const history = [
      { role: 'user', parts: [{ text: 'Older message 1' }] },
      { role: 'model', parts: [{ text: 'Older response 1' }] },
      { role: 'user', parts: [{ text: 'Older message 2' }] },
      { role: 'model', parts: [{ text: 'Older response 2' }] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'shell',
              response: { output: massiveLine },
            },
          },
        ],
      },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    // Force this one to exceed budget
    vi.mocked(estimateTokenCountSync).mockReturnValue(
      COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET + 1,
    );

    const result = await service.compress(
      mockChat,
      'id',
      true,
      mockModel,
      mockConfig,
      false,
    );

    const keptHistory = result.newHistory!.slice(2);
    const shellPart = keptHistory.find((h) =>
      h.parts?.some((p) => p.functionResponse?.name === 'shell'),
    );
    console.log('LLM Sees (Notice pretty-printing + width truncation):');
    console.log(shellPart?.parts?.[0]?.functionResponse?.response?.['content']);
  });

  it('Scenario 3: Single Massive Raw String (Character-based)', async () => {
    console.log('\n--- SCENARIO 3: Single Massive Raw String ---');
    const rawBlob = 'b'.repeat(40000);
    const history = [
      { role: 'user', parts: [{ text: 'Older message 1' }] },
      { role: 'model', parts: [{ text: 'Older response 1' }] },
      { role: 'user', parts: [{ text: 'Older message 2' }] },
      { role: 'model', parts: [{ text: 'Older response 2' }] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'raw_tool',
              response: { content: rawBlob },
            },
          },
        ],
      },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    // Force this one to exceed budget
    vi.mocked(estimateTokenCountSync).mockReturnValue(
      COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET + 1,
    );

    const result = await service.compress(
      mockChat,
      'id',
      true,
      mockModel,
      mockConfig,
      false,
    );

    const keptHistory = result.newHistory!.slice(2);
    const rawPart = keptHistory.find((h) =>
      h.parts?.some((p) => p.functionResponse?.name === 'raw_tool'),
    );
    console.log('LLM Sees (Notice character-based description):');
    console.log(rawPart?.parts?.[0]?.functionResponse?.response?.['content']);
  });
});
