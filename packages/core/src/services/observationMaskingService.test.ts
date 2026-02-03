/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservationMaskingService } from './observationMaskingService.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import type { Config } from '../config/config.js';
import type { Content, Part } from '@google/genai';
import * as fsPromises from 'node:fs/promises';

vi.mock('../utils/tokenCalculation.js', () => ({
  estimateTokenCountSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('ObservationMaskingService', () => {
  let service: ObservationMaskingService;
  let mockConfig: Config;

  const mockedEstimateTokenCountSync = vi.mocked(estimateTokenCountSync);

  beforeEach(() => {
    service = new ObservationMaskingService();
    mockConfig = {
      storage: {
        getHistoryDir: () => '/mock/history',
      },
      getUsageStatisticsEnabled: () => false,
    } as unknown as Config;
    vi.clearAllMocks();
  });

  it('should not mask if total tool tokens are below protection threshold', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'test_tool',
              response: { output: 'small output' },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockReturnValue(100);

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(0);
    expect(result.newHistory).toEqual(history);
  });

  const getToolResponse = (part: Part | undefined): string => {
    const resp = part?.functionResponse?.response as
      | { output: string }
      | undefined;
    return resp?.output ?? (resp as unknown as string) ?? '';
  };

  it('should mask tool outputs beyond the 50k protection window if prunable > 30k', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool1',
              response: { output: 'A\n'.repeat(30000) }, // 60k
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool2',
              response: { output: 'B\n'.repeat(30000) }, // 60k
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool3',
              response: { output: 'C\n'.repeat(10000) }, // 20k
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as
        | { output: string }
        | string;
      const content = typeof resp === 'string' ? resp : resp.output;
      return content.length; // 1 token per char for simple mock
    });

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(2); // tool1 and tool2 masked
    expect(result.tokensSaved).toBeGreaterThan(0);
    expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);

    expect(getToolResponse(result.newHistory[0].parts?.[0])).toContain(
      '<observation_masked_guidance',
    );
    expect(getToolResponse(result.newHistory[0].parts?.[0])).toContain(
      '<estimated_total_tokens>60,000</estimated_total_tokens',
    );
    expect(getToolResponse(result.newHistory[0].parts?.[0])).toContain(
      'search_file_content',
    );

    expect(getToolResponse(result.newHistory[1].parts?.[0])).toContain(
      '<observation_masked_guidance',
    );

    expect(getToolResponse(result.newHistory[2].parts?.[0])).toEqual(
      'C\n'.repeat(10000),
    );
  });

  it('should not mask if prunable tokens are below hysteresis', async () => {
    // Newest 50k protected. Next 20k prunable. 20k < 30k (hysteresis) -> No masking.
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool1',
              response: { output: 'A'.repeat(20000) },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool2',
              response: { output: 'B'.repeat(50000) },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as
        | { output: string }
        | string;
      const content = typeof resp === 'string' ? resp : resp.output;
      return content.length;
    });

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(0);
  });

  it('should not mask if prunable tokens are collectively > 30k but all are individually below maskable threshold', async () => {
    // 5 parts of 10k tokens each = 50k total.
    // 50k > 30k hysteresis, but individual parts (10k) < 12.5k maskable threshold.
    const history: Content[] = Array.from({ length: 11 }, (_, i) => ({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: `tool${i}`,
            response: { output: 'A'.repeat(10000) },
          },
        },
      ],
    }));

    mockedEstimateTokenCountSync.mockReturnValue(10000);

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(0);
    expect(result.tokensSaved).toBe(0);
  });

  it('should handle empty history', async () => {
    const result = await service.mask([], mockConfig);
    expect(result.maskedCount).toBe(0);
    expect(result.newHistory).toEqual([]);
    expect(result.tokensSaved).toBe(0);
  });

  it('should skip non-tool parts', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'some text'.repeat(10000) }],
      },
    ];
    mockedEstimateTokenCountSync.mockReturnValue(10000);

    const result = await service.mask(history, mockConfig);
    expect(result.maskedCount).toBe(0);
    expect(result.newHistory).toEqual(history);
  });

  it('should skip already masked content', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool1',
              response: {
                output: '[Observation Masked]\nsome content'.repeat(10000),
              },
            },
          },
        ],
      },
    ];
    mockedEstimateTokenCountSync.mockReturnValue(20000);

    const result = await service.mask(history, mockConfig);
    expect(result.maskedCount).toBe(0);
  });

  it('should handle different response keys (result, stdout, content, string)', async () => {
    const history: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 't1',
              response: { result: 'A\n'.repeat(30000) },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 't2',
              response: { stdout: 'B\n'.repeat(30000) },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 't3',
              response: { content: 'C\n'.repeat(30000) },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 't4',
              response: 'D\n'.repeat(30000) as unknown as Record<
                string,
                unknown
              >,
            },
          },
        ],
      },
      // Protected part
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 't5',
              response: { output: 'E\n'.repeat(30000) },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const fr = parts[0].functionResponse?.response as unknown;
      if (typeof fr === 'string') return fr.length;
      const resp = fr as Record<string, string>;
      const content =
        resp['output'] || resp['result'] || resp['stdout'] || resp['content'];
      return content?.length || 0;
    });

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(5);

    const r1 = result.newHistory[0].parts![0].functionResponse!
      .response as Record<string, unknown>;
    expect(r1['result'] as string).toContain('[Observation Masked]');

    const r2 = result.newHistory[1].parts![0].functionResponse!
      .response as Record<string, unknown>;
    expect(r2['stdout'] as string).toContain('[Observation Masked]');

    const r3 = result.newHistory[2].parts![0].functionResponse!
      .response as Record<string, unknown>;
    expect(r3['content'] as string).toContain('[Observation Masked]');

    const r4 = result.newHistory[3].parts![0].functionResponse!.response;
    expect(typeof r4).toBe('string');
    expect(r4 as unknown as string).toContain('[Observation Masked]');
  });

  it('should verify masked snippet content (head and tail truncation)', async () => {
    const head = 'START_OF_DATA';
    const mid = 'MIDDLE_OF_DATA'.repeat(10000);
    const tail = 'END_OF_DATA';
    const content = head + mid + tail;

    const history: Content[] = [
      {
        role: 'model',
        parts: [
          { functionResponse: { name: 't1', response: { output: content } } },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionResponse: { name: 't2', response: { output: 'protected' } },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const c = resp['output'] as string;
      if (c === 'protected') return 50000;
      return 100000;
    });

    const result = await service.mask(history, mockConfig);
    expect(result.maskedCount).toBe(1);

    const maskedResponse = result.newHistory[0].parts![0].functionResponse!
      .response as Record<string, unknown>;
    const maskedOutput = maskedResponse['output'] as string;
    expect(maskedOutput).toContain('START_OF_DATA');
    expect(maskedOutput).toContain('END_OF_DATA');
    expect(maskedOutput).toContain('[TRUNCATED');
    expect(maskedOutput).toContain('<observation_masked_guidance');
  });

  it('should use callId in filename if available', async () => {
    const history: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 'my_tool',
              response: {
                output: 'A\n'.repeat(40000),
                callId: 'custom-id-123',
              },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 'p',
              response: { output: 'p'.repeat(50000) },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      return (resp['output'] as string).length;
    });

    await service.mask(history, mockConfig);

    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('my_tool_custom-id-123_'),
      expect.any(String),
      'utf-8',
    );
  });
});
