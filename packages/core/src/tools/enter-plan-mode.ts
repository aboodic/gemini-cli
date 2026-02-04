/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  type ToolResult,
  Kind,
  type ToolInfoConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import { ENTER_PLAN_MODE_TOOL_NAME } from './tool-names.js';
import { ApprovalMode } from '../policy/types.js';

export interface EnterPlanModeParams {
  message?: string;
}

export class EnterPlanModeTool extends BaseDeclarativeTool<
  EnterPlanModeParams,
  ToolResult
> {
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ENTER_PLAN_MODE_TOOL_NAME,
      'Enter Plan Mode',
      'Enters Plan Mode. Use this when you need to design a complex feature or change before implementing it.',
      Kind.Plan,
      {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Optional reason for entering plan mode.',
          },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: EnterPlanModeParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): EnterPlanModeInvocation {
    return new EnterPlanModeInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.config,
    );
  }
}

export class EnterPlanModeInvocation extends BaseToolInvocation<
  EnterPlanModeParams,
  ToolResult
> {
  private confirmationOutcome: ToolConfirmationOutcome | null = null;

  constructor(
    params: EnterPlanModeParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private config: Config,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return this.params.message || 'Initiating Plan Mode';
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolInfoConfirmationDetails | false> {
    const decision = await this.getMessageBusDecision(abortSignal);
    if (decision === 'ALLOW') {
      return false;
    }

    if (decision === 'DENY') {
      throw new Error(
        `Tool execution for "${
          this._toolDisplayName || this._toolName
        }" denied by policy.`,
      );
    }

    // ASK_USER
    return {
      type: 'info',
      title: 'Enter Plan Mode',
      prompt:
        'This will restrict the agent to read-only tools to allow for safe planning.',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        this.confirmationOutcome = outcome;
        await this.publishPolicyUpdate(outcome);
      },
    };
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    if (this.confirmationOutcome === ToolConfirmationOutcome.Cancel) {
      return {
        llmContent: 'User cancelled entering Plan Mode.',
        returnDisplay: 'Cancelled',
      };
    }

    this.config.setApprovalMode(ApprovalMode.PLAN);
    const plansDir = this.config.storage.getProjectTempPlansDir();
    const messagePart = this.params.message
      ? `Reason: ${this.params.message}\n`
      : '';

    const content = `Entered Plan Mode.
${messagePart}
You are now restricted to read-only tools.
1. Use read-only tools to explore the codebase.
2. Use \`write_file\` to save your plan to: ${plansDir}/<plan_name>.md
3. When finished, use \`exit_plan_mode(plan_path)\` to submit your plan for approval.`;

    return {
      llmContent: content,
      returnDisplay: this.params.message
        ? `Entered Plan Mode: ${this.params.message}`
        : 'Entered Plan Mode',
    };
  }
}
