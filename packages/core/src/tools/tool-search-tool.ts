/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  Kind,
  type ToolResult,
  BaseToolInvocation,
  type ToolInvocation,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

type ToolParams = { query: string };

export type SearchCallback = (query: string) => Promise<ToolResult>;

class ToolSearchToolInvocation extends BaseToolInvocation<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly searchCallback: SearchCallback,
    toolName: string,
    params: ToolParams,
    messageBus: MessageBus,
  ) {
    super(params, messageBus, toolName);
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    return this.searchCallback(this.params.query);
  }

  getDescription(): string {
    return `Search query: ${this.params.query}`;
  }
}

export class ToolSearchTool extends BaseDeclarativeTool<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly searchCallback: SearchCallback,
    messageBus: MessageBus,
  ) {
    super(
      'search_tools',
      'search_tools',
      'Search for available tools that are not currently loaded in the context. Use this to find tools for specific tasks.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant tools.',
          },
        },
        required: ['query'],
      },
      messageBus,
      false,
      false,
    );
  }

  protected createInvocation(
    params: ToolParams,
    messageBus: MessageBus,
    toolName?: string,
  ): ToolInvocation<ToolParams, ToolResult> {
    return new ToolSearchToolInvocation(
      this.searchCallback,
      toolName ?? this.name,
      params,
      messageBus,
    );
  }
}
