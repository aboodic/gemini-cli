/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConfigParameters } from '../config/config.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { MockTool } from '../test-utils/mock-tool.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolSearchTool } from './tool-search-tool.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  default: {
    existsSync: () => true,
    statSync: () => ({ isDirectory: () => true }),
  },
}));

vi.mock('../config/config.js');

// Mock DiscoveredMCPTool to support instanceof checks
vi.mock('./mcp-tool.js', () => {
  class MockDiscoveredMCPTool {
    name: string;
    description: string;
    serverName: string = 'test-server';
    schema: Record<string, unknown>;

    constructor(name: string, description: string) {
      this.name = name;
      this.description = description;
      this.schema = {
        name,
        description,
        parametersJsonSchema: { type: 'object' },
      };
    }

    getFullyQualifiedPrefix() {
      return this.serverName + '__';
    }
  }
  return {
    DiscoveredMCPTool: MockDiscoveredMCPTool,
  };
});

const mockMessageBus = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
} as unknown as MessageBus;

describe('ToolRegistry Tool Search', () => {
  let config: Config;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    config = new Config({} as unknown as ConfigParameters);
    vi.mocked(config.getExcludeTools).mockReturnValue(new Set());
    toolRegistry = new ToolRegistry(config, mockMessageBus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMcpTool = (name: string, description: string = 'A test tool') =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (DiscoveredMCPTool as any)(
      name,
      description,
    ) as unknown as DiscoveredMCPTool;

  it('should return all tools when under token threshold', () => {
    const tool1 = createMcpTool('tool1');
    const tool2 = createMcpTool('tool2');

    toolRegistry.registerTool(tool1);
    toolRegistry.registerTool(tool2);

    const decls = toolRegistry.getFunctionDeclarations();
    expect(decls).toHaveLength(2);
    expect(decls.map((d) => d.name)).toContain('tool1');
    expect(decls.map((d) => d.name)).toContain('tool2');
    expect(decls.map((d) => d.name)).not.toContain('search_tools');
  });

  it('should enable tool search when over token threshold', () => {
    // Create a large description to exceed threshold (30000 chars)
    const largeDescription = 'a'.repeat(30001);
    const bigTool = createMcpTool('big_tool', largeDescription);
    const smallTool = createMcpTool('small_tool', 'small');

    toolRegistry.registerTool(bigTool);
    toolRegistry.registerTool(smallTool);

    const decls = toolRegistry.getFunctionDeclarations();

    // Should have search_tools
    expect(decls.map((d) => d.name)).toContain('search_tools');

    // Both should be hidden as neither is activated and total > threshold
    expect(decls.map((d) => d.name)).not.toContain('big_tool');
    expect(decls.map((d) => d.name)).not.toContain('small_tool');
  });

  it('should not hide native tools even when over threshold', () => {
    const largeDescription = 'a'.repeat(30001);
    const bigMcpTool = createMcpTool('big_mcp', largeDescription);
    const nativeTool = new MockTool({ name: 'native_tool' });

    toolRegistry.registerTool(bigMcpTool);
    toolRegistry.registerTool(nativeTool);

    const decls = toolRegistry.getFunctionDeclarations();

    expect(decls.map((d) => d.name)).toContain('search_tools');
    expect(decls.map((d) => d.name)).not.toContain('big_mcp');
    expect(decls.map((d) => d.name)).toContain('native_tool');
  });

  it('should find hidden tools via search and activate them', async () => {
    const largeDescription = 'a'.repeat(30001);
    const hiddenTool = createMcpTool(
      'hidden_tool',
      largeDescription + ' searchable_term',
    );

    toolRegistry.registerTool(hiddenTool);

    // Verify hidden initially
    let decls = toolRegistry.getFunctionDeclarations();
    expect(decls.map((d) => d.name)).toContain('search_tools');
    expect(decls.map((d) => d.name)).not.toContain('hidden_tool');

    // Search for it
    const searchTool = toolRegistry.getTool('search_tools') as ToolSearchTool;
    const invocation = searchTool.build({ query: 'searchable_term' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 1 tools');
    expect(result.llmContent).toContain('hidden_tool');

    // Verify activated
    decls = toolRegistry.getFunctionDeclarations();
    expect(decls.map((d) => d.name)).toContain('hidden_tool');
    expect(decls.map((d) => d.name)).toContain('search_tools'); // Search tool stays
  });

  it('should auto-activate tool if accessed via getTool', () => {
    const largeDescription = 'a'.repeat(30001);
    const hiddenTool = createMcpTool('hidden_tool', largeDescription);
    toolRegistry.registerTool(hiddenTool);

    // Initially hidden
    let decls = toolRegistry.getFunctionDeclarations();
    expect(decls.map((d) => d.name)).not.toContain('hidden_tool');

    // Access it
    const tool = toolRegistry.getTool('hidden_tool');
    expect(tool).toBeDefined();

    // Should be activated now
    decls = toolRegistry.getFunctionDeclarations();
    expect(decls.map((d) => d.name)).toContain('hidden_tool');
  });
});
