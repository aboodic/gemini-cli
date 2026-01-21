/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { evalTest, TestRig } from './test-helper.js';

const FILES = {
  'app.ts': 'const add = (a: number, b: number) => a - b;',
} as const;

describe('analysis mode eval', () => {
  /**
   * Ensures that when the user asks to "inspect" for bugs, the agent does NOT
   * automatically modify the file, but instead asks for permission.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should not edit files when asked to inspect for bugs',
    prompt: 'Inspect app.ts for bugs',
    files: FILES,
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Verify NO edit tools called
      const editCalls = toolLogs.filter((log) =>
        ['replace', 'write_file'].includes(log.toolRequest.name),
      );
      expect(editCalls.length).toBe(0);

      // Verify file unchanged
      const content = rig.readFile('app.ts');
      expect(content).toContain('a - b');
    },
  });

  /**
   * Ensures that when the user explicitly asks to "fix" a bug, the agent
   * does modify the file.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should edit files when asked to fix bug',
    prompt: 'Fix the bug in app.ts - it should add numbers not subtract',
    files: FILES,
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Verify edit tools WERE called
      const editCalls = toolLogs.filter(
        (log) =>
          ['replace', 'write_file'].includes(log.toolRequest.name) &&
          log.toolRequest.success,
      );
      expect(editCalls.length).toBeGreaterThanOrEqual(1);

      // Verify file changed
      const content = rig.readFile('app.ts');
      expect(content).toContain('a + b');
    },
  });

  /**
   * Ensures that when the user asks "any bugs?" the agent does NOT
   * automatically modify the file, but instead asks for permission.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should not edit when asking "any bugs"',
    prompt: 'Any bugs in app.ts?',
    files: FILES,
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Verify NO edit tools called
      const editCalls = toolLogs.filter((log) =>
        ['replace', 'write_file'].includes(log.toolRequest.name),
      );
      expect(editCalls.length).toBe(0);

      // Verify file unchanged
      const content = rig.readFile('app.ts');
      expect(content).toContain('a - b');
    },
  });

  it('should only edit when directive is given after inquiry (interactive)', async () => {
    const rig = new TestRig();
    try {
      rig.setup('interactive-inquiry-directive');
      rig.createFile('app.ts', FILES['app.ts']);

      const run = await rig.runInteractive();

      // Turn 1: Inquiry
      await run.sendKeys('Any bugs in app.ts?');
      await run.type('\r');

      // Wait for analysis to finish (it should find the bug but not fix it)
      await run.expectText('bug', 30000);

      // Verify no edit tools called yet
      let toolLogs = rig.readToolLogs();
      let editCalls = toolLogs.filter((log) =>
        ['replace', 'write_file'].includes(log.toolRequest.name),
      );
      expect(editCalls.length).toBe(0);

      // Turn 2: Directive
      await run.sendKeys('Fix it');
      await run.type('\r');

      // Wait for fix
      await rig.expectToolCallSuccess(['replace', 'write_file']);

      // Verify file changed
      const content = rig.readFile('app.ts');
      expect(content).toContain('a + b');
    } finally {
      await rig.cleanup();
    }
  }, 120000);
});
