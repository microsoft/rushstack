// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import type { IShardResultManifest } from '../IShardResultManifest';
import {
  ShardCoherenceError,
  loadShardResultsAsync,
  readShardResultsAsync,
  validateShardResults,
  type IShardCollationRequest
} from '../ShardCollation';
import * as ShardResultManifest from '../ShardResultManifest';
import { getShardManifestPath, writeShardResultManifestAsync } from '../ShardResultManifest';
import { getShardFolderName } from '../ShardIdentity';

function createManifest(overrides?: Partial<IShardResultManifest>): IShardResultManifest {
  return {
    version: 1,
    shardIndex: 1,
    shardCount: 1,
    status: 'completed',
    phaseName: 'test',
    startedAt: '2026-09-14T00:00:00.000Z',
    durationMs: 100,
    diagnosticCount: 0,
    itemCount: 5,
    ...overrides
  };
}

function createManifests(shardCount: number): IShardResultManifest[] {
  const manifests: IShardResultManifest[] = [];
  for (let shardIndex: number = 1; shardIndex <= shardCount; shardIndex++) {
    manifests.push(createManifest({ shardIndex, shardCount }));
  }
  return manifests;
}

function getViolations(manifests: readonly IShardResultManifest[], shardCount: number): readonly string[] {
  try {
    validateShardResults(manifests, shardCount, 'test');
  } catch (error) {
    if (error instanceof ShardCoherenceError) return error.violations;
    throw error;
  }
  throw new Error('Expected incoherent results to be rejected.');
}

describe('validateShardResults', () => {
  it('returns ordered manifests and totals without reordering inputs or interpreting payloads', () => {
    const manifests = createManifests(4).reverse();
    const payload: object = { opaque: true };
    manifests[0].payload = payload;
    const result = validateShardResults(manifests, 4, 'test');
    expect(result).toMatchObject({ phaseName: 'test', itemCount: 20, diagnosticCount: 0, passed: true });
    expect(result.manifests.map((manifest) => manifest.shardIndex)).toEqual([1, 2, 3, 4]);
    expect(manifests.map((manifest) => manifest.shardIndex)).toEqual([4, 3, 2, 1]);
    expect(result.manifests[3].payload).toBe(payload);
  });

  it('rejects missing, duplicate and out-of-range indexes together', () => {
    expect(
      getViolations(
        [
          createManifest({ shardIndex: 2, shardCount: 4 }),
          createManifest({ shardIndex: 2, shardCount: 4 }),
          createManifest({ shardIndex: 5, shardCount: 4 })
        ],
        4
      )
    ).toEqual([
      '2 results claim to be shard 2',
      'a result claims to be shard 5, but only 4 were scheduled',
      'no result was found for shards 1, 3, 4 of 4'
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid shard indexes and scheduled counts %p',
    (value) => {
      expect(() => validateShardResults([createManifest({ shardIndex: value })], 1, 'test')).toThrow(
        /invalid shard index/
      );
      expect(() => validateShardResults([], value, 'test')).toThrow(
        /positive integer in the safe integer range/
      );
    }
  );

  it('names every shard with a count mismatch or harness failure', () => {
    const manifests = createManifests(3);
    manifests[0].shardCount = 4;
    manifests[1].shardCount = 4;
    manifests[1].status = 'harness-failure';
    manifests[2].status = 'harness-failure';
    expect(getViolations(manifests, 3)).toEqual([
      '3 shards were scheduled, but shards 1, 2 ran as part of a 4-shard run',
      'shards 2, 3 failed to run at all'
    ]);
  });

  it('rejects even a uniformly incorrect producer phase', () => {
    const manifests = createManifests(2);
    for (const manifest of manifests) manifest.phaseName = 'other';
    expect(getViolations(manifests, 2)).toEqual(['shards 1, 2 do not report producer phase "test"']);
  });

  it('accepts compatible slots produced in separate executions', () => {
    const manifests = createManifests(2);
    manifests[1].startedAt = '2026-11-23T00:00:00.000Z';
    expect(validateShardResults(manifests, 2, 'test').passed).toBe(true);
  });

  it.each(['diagnosticCount', 'itemCount'] as const)('rejects malformed individual %s', (field) => {
    for (const count of [-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateShardResults([createManifest({ [field]: count })], 1, 'test')).toThrow(/count of/);
    }
  });

  it.each(['diagnosticCount', 'itemCount'] as const)('checks aggregate %s at the safe boundary', (field) => {
    const manifests = createManifests(2);
    manifests[0][field] = Number.MAX_SAFE_INTEGER;
    manifests[1][field] = 0;
    expect(validateShardResults(manifests, 2, 'test')[field]).toBe(Number.MAX_SAFE_INTEGER);
    manifests[1][field] = 1;
    expect(() => validateShardResults(manifests, 2, 'test')).toThrow(/combined shard counters/);
  });

  it('does not let negative diagnostics cancel out a real failure', () => {
    const manifests = createManifests(2);
    manifests[0].diagnosticCount = -5;
    manifests[1].diagnosticCount = 5;
    expect(getViolations(manifests, 2)).toEqual(['shard 1 reported a diagnostic count of -5']);
  });

  it.each([0, 2])('leaves empty-workload policy to consumers while preserving %p diagnostics', (count) => {
    const manifests = createManifests(2);
    for (const manifest of manifests) manifest.itemCount = 0;
    manifests[1].diagnosticCount = count;
    expect(validateShardResults(manifests, 2, 'test')).toMatchObject({
      itemCount: 0,
      diagnosticCount: count,
      passed: count === 0
    });
  });

  it.each([
    ['version', 2],
    ['status', 'unknown'],
    ['durationMs', -1]
  ])('applies the envelope schema to in-memory %s', (field, value) => {
    const manifest = createManifest();
    Reflect.set(manifest, field, value);
    expect(() => validateShardResults([manifest], 1, 'test')).toThrow(ShardCoherenceError);
  });

  it('orders diagnostics deterministically and bounds gaps by actual inputs, not CLI count', () => {
    const manifests = [
      createManifest({ shardIndex: Number.NaN, diagnosticCount: -1 }),
      createManifest({ shardIndex: 0, itemCount: -1 }),
      createManifest({ shardIndex: 2, phaseName: 'other', diagnosticCount: -2 })
    ];
    expect(getViolations(manifests, 4)).toEqual(getViolations([...manifests].reverse(), 4));
    const shardCount = Number.MAX_SAFE_INTEGER;
    expect(getViolations([], shardCount)).toEqual([
      `no result was found for shards 1-${shardCount} of ${shardCount}`
    ]);
    expect(
      getViolations(
        [
          createManifest({ shardCount, shardIndex: 1 }),
          createManifest({ shardCount, shardIndex: shardCount - 1 })
        ],
        shardCount
      )
    ).toEqual([`no result was found for shards 2-${shardCount - 2}, ${shardCount} of ${shardCount}`]);
  });
});

describe('addressed shard manifest discovery', () => {
  const folder: string = path.join(__dirname, 'collation-discovery-fixture');
  const parent: string = path.join(folder, 'shards');
  let request: IShardCollationRequest;
  let created: boolean;

  beforeEach(async () => {
    created = false;
    await fs.mkdir(folder);
    created = true;
    await fs.mkdir(parent);
    request = {
      shardParentFolderPath: parent,
      shardFolderNameTemplate: 'slot-{shardIndex}-result',
      shardCount: 2,
      producerPhaseName: 'test',
      producerTaskName: 'jest'
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (created) await FileSystem.deleteFolderAsync(folder);
  });

  function taskFolder(index: number): string {
    return path.join(parent, getShardFolderName(index, request.shardFolderNameTemplate), 'test', 'jest');
  }

  async function writeShardsAsync(): Promise<void> {
    for (const manifest of createManifests(2)) {
      await writeShardResultManifestAsync(taskFolder(manifest.shardIndex), manifest);
    }
  }

  it('reads only the explicit task address and sorts results regardless of directory enumeration order', async () => {
    await writeShardsAsync();
    await writeShardResultManifestAsync(path.join(parent, 'retry', 'test', 'jest'), createManifest());
    await writeShardResultManifestAsync(
      path.join(parent, 'slot-1-result', 'test', 'other'),
      createManifest()
    );
    await fs.mkdir(taskFolder(3), { recursive: true });
    await fs.writeFile(getShardManifestPath(taskFolder(3)), 'obsolete partition');
    const readFolderItems = FileSystem.readFolderItemsAsync.bind(FileSystem);
    jest
      .spyOn(FileSystem, 'readFolderItemsAsync')
      .mockImplementation(async (name) => (await readFolderItems(name)).reverse());
    expect((await loadShardResultsAsync(request)).manifests.map((manifest) => manifest.shardIndex)).toEqual([
      1, 2
    ]);
  });

  it('does not accept a manifest from a different task or the slot root to fill a missing task', async () => {
    await writeShardsAsync();
    await fs.unlink(getShardManifestPath(taskFolder(2)));
    await writeShardResultManifestAsync(
      path.dirname(path.dirname(taskFolder(2))),
      createManifest({ shardIndex: 2, shardCount: 2 })
    );
    await expect(loadShardResultsAsync(request)).rejects.toThrow(/no result was found for shard 2/);
  });

  it('rejects a manifest moved into the wrong slot', async () => {
    await writeShardResultManifestAsync(taskFolder(1), createManifest({ shardIndex: 2, shardCount: 2 }));
    await expect(loadShardResultsAsync(request)).rejects.toThrow(
      /slot "slot-1-result".*shard 2, not shard 1/
    );
  });

  it('omits missing inputs without mistaking them for a completed run', async () => {
    await fs.writeFile(path.join(parent, 'notes.txt'), 'ignored');
    await expect(readShardResultsAsync(request)).resolves.toEqual([]);
    await expect(loadShardResultsAsync(request)).rejects.toThrow(/no result was found/);
    await expect(
      readShardResultsAsync({ ...request, shardParentFolderPath: path.join(folder, 'absent') })
    ).resolves.toEqual([]);
  });

  it.each(['{ invalid', '{"version":2}'])('rejects corrupt or schema-invalid JSON %s', async (contents) => {
    await writeShardsAsync();
    await fs.writeFile(getShardManifestPath(taskFolder(1)), contents);
    await expect(readShardResultsAsync(request)).rejects.toThrow();
  });

  it.each(['parent', 'slot', 'phase', 'task', 'manifest'] as const)(
    'rejects an addressed %s junction',
    async (location) => {
      await writeShardsAsync();
      const target = path.join(folder, 'target');
      await fs.mkdir(target);
      if (location === 'parent') {
        const alias = path.join(folder, 'parent-alias');
        await fs.symlink(parent, alias, 'junction');
        request.shardParentFolderPath = alias;
      } else {
        const task = taskFolder(1);
        const replaced =
          location === 'manifest'
            ? getShardManifestPath(task)
            : location === 'task'
              ? task
              : location === 'phase'
                ? path.dirname(task)
                : path.dirname(path.dirname(task));
        await fs.rm(replaced, { recursive: true });
        await fs.symlink(target, replaced, 'junction');
      }
      await expect(readShardResultsAsync(request)).rejects.toThrow(/symbolic link/);
    }
  );

  it('rejects non-file manifests without reading them', async () => {
    await fs.mkdir(getShardManifestPath(taskFolder(1)), { recursive: true });
    const read = jest.spyOn(ShardResultManifest, 'tryReadShardResultManifestAsync');
    await expect(readShardResultsAsync(request)).rejects.toThrow(/regular files/);
    expect(read).not.toHaveBeenCalled();
  });

  it('propagates filesystem errors instead of returning an empty set', async () => {
    const error = Object.assign(new Error('access denied'), { code: 'EACCES' });
    jest.spyOn(FileSystem, 'readFolderItemsAsync').mockRejectedValue(error);
    await expect(readShardResultsAsync(request)).rejects.toBe(error);
  });

  it.each(['enumeration', 'manifest'] as const)('honors cancellation during %s', async (stage) => {
    await writeShardsAsync();
    const controller = new AbortController();
    if (stage === 'enumeration') {
      const read = FileSystem.readFolderItemsAsync.bind(FileSystem);
      jest.spyOn(FileSystem, 'readFolderItemsAsync').mockImplementation(async (name) => {
        const result = await read(name);
        controller.abort(new Error('cancelled enumeration'));
        return result;
      });
    } else {
      const read = ShardResultManifest.tryReadShardResultManifestAsync;
      jest.spyOn(ShardResultManifest, 'tryReadShardResultManifestAsync').mockImplementation(async (name) => {
        const result = await read(name);
        controller.abort(new Error('cancelled manifest'));
        return result;
      });
    }
    await expect(readShardResultsAsync(request, controller.signal)).rejects.toThrow(`cancelled ${stage}`);
  });

  it('rejects invalid addressing, counts and pre-cancellation before filesystem access', async () => {
    const read = jest.spyOn(fs, 'lstat');
    await expect(loadShardResultsAsync({ ...request, shardCount: 0 })).rejects.toThrow(/shard count/);
    await expect(loadShardResultsAsync({ ...request, producerTaskName: '../other' })).rejects.toThrow();
    await expect(
      loadShardResultsAsync({ ...request, shardFolderNameTemplate: '../{shardIndex}' })
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(readShardResultsAsync(request, controller.signal)).rejects.toThrow('cancelled');
    expect(read).not.toHaveBeenCalled();
  });
});
