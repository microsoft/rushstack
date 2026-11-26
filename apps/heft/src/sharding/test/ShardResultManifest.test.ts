// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import type { IShardResultManifest } from '../IShardResultManifest';
import { getShardTaskFolderPath } from '../ShardIdentity';
import {
  SHARD_MANIFEST_FILENAME,
  getShardManifestPath,
  invalidateShardResultManifestAsync,
  readShardResultManifestAsync,
  tryReadShardResultManifestAsync,
  validateShardResultManifest,
  writeShardResultManifestAsync
} from '../ShardResultManifest';

function createManifest(overrides?: Partial<IShardResultManifest>): IShardResultManifest {
  return {
    version: 1,
    shardIndex: 1,
    shardCount: 4,
    status: 'completed',
    phaseName: 'test',
    startedAt: '2026-09-14T00:00:00.000Z',
    durationMs: 1234,
    diagnosticCount: 0,
    itemCount: 7,
    ...overrides
  };
}

describe('ShardResultManifest', () => {
  const shardFolderPath: string = path.join(__dirname, 'shard-manifest-files');
  let created: boolean;

  beforeEach(async () => {
    created = false;
    await fs.mkdir(shardFolderPath);
    created = true;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (created) await FileSystem.deleteFolderAsync(shardFolderPath);
  });

  it('places the manifest at the documented filename within the shard folder', () => {
    expect(getShardManifestPath(shardFolderPath)).toEqual(
      path.join(shardFolderPath, SHARD_MANIFEST_FILENAME)
    );
  });

  it('round-trips a manifest', async () => {
    const manifest: IShardResultManifest = createManifest();
    await writeShardResultManifestAsync(shardFolderPath, manifest);

    await expect(readShardResultManifestAsync(shardFolderPath)).resolves.toEqual(manifest);
    expect(await fs.readdir(shardFolderPath)).toEqual([SHARD_MANIFEST_FILENAME]);
  });

  it('validates an in-memory manifest without interpreting workload diagnostics', () => {
    const manifest: IShardResultManifest = createManifest({ diagnosticCount: 3, itemCount: 0 });
    expect(validateShardResultManifest(manifest)).toBe(manifest);
    expect(validateShardResultManifest(createManifest({ status: 'harness-failure' })).status).toBe(
      'harness-failure'
    );
  });

  it('invalidates only its own manifest, preserving other output and siblings', async () => {
    await writeShardResultManifestAsync(shardFolderPath, createManifest());
    await fs.writeFile(path.join(shardFolderPath, 'report.json'), '{}');
    await invalidateShardResultManifestAsync(shardFolderPath);
    await invalidateShardResultManifestAsync(shardFolderPath);
    expect(await fs.readdir(shardFolderPath)).toEqual(['report.json']);
  });

  it('rejects invalid output before publishing a commit marker', async () => {
    await expect(
      writeShardResultManifestAsync(shardFolderPath, createManifest({ itemCount: -1 }))
    ).rejects.toThrow(/JSON validation failed/);
    expect(await fs.readdir(shardFolderPath)).toEqual([]);
  });

  it('propagates an atomic rename failure and removes only its own staging file', async () => {
    await fs.mkdir(getShardManifestPath(shardFolderPath));
    await fs.writeFile(path.join(shardFolderPath, 'report.json'), '{}');
    await expect(writeShardResultManifestAsync(shardFolderPath, createManifest())).rejects.toThrow();
    expect((await fs.readdir(shardFolderPath)).sort()).toEqual(['report.json', SHARD_MANIFEST_FILENAME]);
  });

  it('does not publish a cancelled result', async () => {
    const controller: AbortController = new AbortController();
    controller.abort();
    await expect(
      writeShardResultManifestAsync(shardFolderPath, createManifest(), controller.signal)
    ).rejects.toThrow();
    await expect(tryReadShardResultManifestAsync(shardFolderPath)).resolves.toBeUndefined();
  });

  it('checks cancellation after awaiting the atomic writer', async () => {
    const controller: AbortController = new AbortController();
    const originalRename: typeof fs.rename = fs.rename;
    jest.spyOn(fs, 'rename').mockImplementation(async (...args) => {
      await originalRename(...args);
      queueMicrotask(() =>
        queueMicrotask(() => controller.abort(new Error('cancelled after atomic writer')))
      );
    });
    await expect(
      writeShardResultManifestAsync(shardFolderPath, createManifest(), controller.signal)
    ).rejects.toThrow('cancelled after atomic writer');
    await expect(tryReadShardResultManifestAsync(shardFolderPath)).resolves.toBeUndefined();
  });

  it.each([1, 2])('does not remove a replacement during cancellation at await boundary %s', async (depth) => {
    const controller: AbortController = new AbortController();
    const replacementPath: string = path.join(shardFolderPath, 'replacement.json');
    const replacement: IShardResultManifest = createManifest({ itemCount: 20 });
    await fs.writeFile(replacementPath, JSON.stringify(replacement));
    const originalRename: typeof fs.rename = fs.rename;
    jest.spyOn(fs, 'rename').mockImplementation(async (...args) => {
      await originalRename(...args);
      let remaining: number = depth;
      const replaceAndCancel: () => void = () => {
        if (--remaining > 0) {
          queueMicrotask(replaceAndCancel);
        } else {
          fsSync.renameSync(replacementPath, getShardManifestPath(shardFolderPath));
          controller.abort(new Error('cancelled original publication'));
        }
      };
      queueMicrotask(replaceAndCancel);
    });
    await expect(
      writeShardResultManifestAsync(shardFolderPath, createManifest(), controller.signal)
    ).rejects.toThrow('cancelled original publication');
    expect(await readShardResultManifestAsync(shardFolderPath)).toEqual(replacement);
    expect(await fs.readdir(shardFolderPath)).toEqual([SHARD_MANIFEST_FILENAME]);
  });

  it('preserves an adapter payload without inspecting it', async () => {
    const payload: unknown = { testResults: [{ name: 'a' }], nested: { deep: [1, 2, 3] } };
    await writeShardResultManifestAsync(shardFolderPath, createManifest({ payload }));

    const result: IShardResultManifest = await readShardResultManifestAsync(shardFolderPath);
    expect(result.payload).toEqual(payload);
  });

  it('writes a manifest whose payload was explicitly set to undefined', async () => {
    await writeShardResultManifestAsync(shardFolderPath, createManifest({ payload: undefined }));

    const result: IShardResultManifest = await readShardResultManifestAsync(shardFolderPath);
    expect(result.payload).toBeUndefined();
  });

  it('creates the shard folder if it does not yet exist', async () => {
    const nestedFolderPath: string = path.join(shardFolderPath, 'does', 'not', 'exist');
    await writeShardResultManifestAsync(nestedFolderPath, createManifest());

    await expect(readShardResultManifestAsync(nestedFolderPath)).resolves.toBeDefined();
  });

  it('keeps multiple producer tasks separate inside the same slot', async () => {
    const first: string = getShardTaskFolderPath(shardFolderPath, 'test', 'unit');
    const second: string = getShardTaskFolderPath(shardFolderPath, 'test', 'integration');
    await writeShardResultManifestAsync(first, createManifest({ itemCount: 1 }));
    await writeShardResultManifestAsync(second, createManifest({ itemCount: 2 }));
    expect((await readShardResultManifestAsync(first)).itemCount).toBe(1);
    expect((await readShardResultManifestAsync(second)).itemCount).toBe(2);
  });

  it('accepts completion evidence from different runs without invocation or attempt tokens', async () => {
    const first: IShardResultManifest = createManifest();
    const second: IShardResultManifest = createManifest({
      shardIndex: 2,
      startedAt: '2026-11-23T00:00:00.000Z'
    });
    for (const manifest of [first, second]) {
      const slot: string = getShardTaskFolderPath(
        path.join(shardFolderPath, String(manifest.shardIndex)),
        'test',
        'jest'
      );
      await writeShardResultManifestAsync(slot, manifest);
      expect(await readShardResultManifestAsync(slot)).toEqual(manifest);
    }
  });

  it('reports a missing manifest as undefined rather than throwing', async () => {
    await expect(tryReadShardResultManifestAsync(shardFolderPath)).resolves.toBeUndefined();
  });

  it('throws when a required manifest is missing', async () => {
    await expect(readShardResultManifestAsync(shardFolderPath)).rejects.toThrow(/ENOENT|no such file/i);
  });

  it('throws rather than reporting undefined when a manifest is present but unparseable', async () => {
    await FileSystem.writeFileAsync(getShardManifestPath(shardFolderPath), '{ not json');

    await expect(tryReadShardResultManifestAsync(shardFolderPath)).rejects.toThrow(/Error reading/);
  });

  it('throws rather than reporting undefined when a manifest is present but invalid', async () => {
    await FileSystem.writeFileAsync(getShardManifestPath(shardFolderPath), JSON.stringify({ version: 1 }));

    await expect(tryReadShardResultManifestAsync(shardFolderPath)).rejects.toThrow(/JSON validation failed/);
  });

  it.each([
    { description: 'an unsupported version', overrides: { version: 2 } },
    { description: 'a zero shard index', overrides: { shardIndex: 0 } },
    { description: 'a zero shard count', overrides: { shardCount: 0 } },
    { description: 'a fractional shard index', overrides: { shardIndex: 1.5 } },
    { description: 'an unsafe shard index', overrides: { shardIndex: Number.MAX_SAFE_INTEGER + 1 } },
    { description: 'an obsolete generation', overrides: { generation: 'run-1' } },
    { description: 'an obsolete attempt', overrides: { producerAttempt: 'attempt-1' } },
    { description: 'an obsolete workload name', overrides: { workload: 'jest' } },
    { description: 'an empty phase name', overrides: { phaseName: '' } },
    { description: 'a missing phase name', overrides: { phaseName: undefined } },
    { description: 'an unrecognized status', overrides: { status: 'ok' } },
    { description: 'a non-timestamp startedAt', overrides: { startedAt: 'not a date' } },
    { description: 'a negative duration', overrides: { durationMs: -1 } },
    { description: 'a non-finite duration', overrides: { durationMs: Number.POSITIVE_INFINITY } },
    { description: 'a negative diagnostic count', overrides: { diagnosticCount: -1 } },
    { description: 'a fractional item count', overrides: { itemCount: 1.5 } },
    { description: 'an unsafe item count', overrides: { itemCount: Number.MAX_SAFE_INTEGER + 1 } },
    {
      description: 'an unsafe diagnostic count',
      overrides: { diagnosticCount: Number.MAX_SAFE_INTEGER + 1 }
    },
    { description: 'an unsafe shard count', overrides: { shardCount: Number.MAX_SAFE_INTEGER + 1 } },
    { description: 'an unrecognized property', overrides: { unexpected: true } }
  ])('rejects a manifest with $description', async ({ overrides }) => {
    await FileSystem.writeFileAsync(
      getShardManifestPath(shardFolderPath),
      JSON.stringify({ ...createManifest(), ...overrides })
    );

    await expect(readShardResultManifestAsync(shardFolderPath)).rejects.toThrow(/JSON validation failed/);
  });
});
