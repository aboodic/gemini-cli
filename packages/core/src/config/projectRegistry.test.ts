/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectRegistry } from './projectRegistry.js';

describe('ProjectRegistry', () => {
  let tempDir: string;
  let registryPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-registry-test-'));
    registryPath = path.join(tempDir, 'projects.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates a short ID from the basename', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();
    const shortId = await registry.getShortId('/path/to/my-project');
    expect(shortId).toBe('my-project');
  });

  it('slugifies the project name', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();
    const shortId = await registry.getShortId('/path/to/My Project! @2025');
    expect(shortId).toBe('my-project-2025');
  });

  it('handles collisions with unique suffixes', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();

    const id1 = await registry.getShortId('/path/one/gemini');
    const id2 = await registry.getShortId('/path/two/gemini');
    const id3 = await registry.getShortId('/path/three/gemini');

    expect(id1).toBe('gemini');
    expect(id2).toBe('gemini-1');
    expect(id3).toBe('gemini-2');
  });

  it('persists and reloads the registry', async () => {
    const registry1 = new ProjectRegistry(registryPath);
    await registry1.initialize();
    await registry1.getShortId('/path/to/project-a');

    const registry2 = new ProjectRegistry(registryPath);
    await registry2.initialize();
    const id = await registry2.getShortId('/path/to/project-a');

    expect(id).toBe('project-a');

    const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    expect(Object.values(data.projects)).toContain('project-a');
  });

  it('normalizes paths', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();
    const path1 = path.resolve('/path/to/project');
    const path2 = path.join(path1, '..', 'project');

    const id1 = await registry.getShortId(path1);
    const id2 = await registry.getShortId(path2);

    expect(id1).toBe(id2);
  });

  it('throws if not initialized', async () => {
    const registry = new ProjectRegistry(registryPath);
    await expect(registry.getShortId('/foo')).rejects.toThrow(
      'ProjectRegistry must be initialized before use',
    );
  });
});
