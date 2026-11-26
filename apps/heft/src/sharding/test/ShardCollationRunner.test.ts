// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import path from 'node:path';

import type { IShardCollationAdapter, IShardCollationSession } from '../IShardCollationAdapter';
import {
  collateShardsAsync,
  createShardCollationError,
  type IShardCollationRunOptions
} from '../ShardCollationRunner';
import { invalidateShardFileAsync, writeShardFileAtomicallyAsync } from '../ShardFileSystem';
import { getShardManifestPath, writeShardResultManifestAsync } from '../ShardResultManifest';

describe('neutral adapter orchestration', () => {
  let folder: string;
  let filename: string;
  let options: IShardCollationRunOptions;
  let controller: AbortController;
  let events: string[];
  let created: boolean;

  beforeEach(async () => {
    folder = path.join(__dirname, 'collation-runner-fixture');
    created = false;
    await fs.mkdir(folder);
    created = true;
    filename = path.join(folder, 'report.json');
    options = {
      buildFolderPath: folder,
      shardParentFolderPath: path.join(folder, 'shards'),
      shardCount: 1,
      shardFolderNameTemplate: '{shardIndex}',
      producerPhaseName: 'test',
      producerTaskName: 'example'
    };
    controller = new AbortController();
    events = [];
    await writeShardResultManifestAsync(path.join(folder, 'shards', '1', 'test', 'example'), {
      version: 1,
      shardIndex: 1,
      shardCount: 1,
      status: 'completed',
      phaseName: 'test',
      startedAt: '2026-09-14T00:00:00.000Z',
      durationMs: 1,
      itemCount: 1,
      diagnosticCount: 1
    });
    await fs.writeFile(filename, '{"old":true,"success":true}');
  });

  afterEach(async () => {
    if (created) await fs.rm(folder, { recursive: true });
  });

  function createAdapter(diagnosticCount: number = 1, afterPublication?: () => void): IShardCollationAdapter {
    return {
      acquireAsync: async (context) => {
        expect(context).toEqual({
          shardParentFolderPath: options.shardParentFolderPath,
          shardCount: options.shardCount,
          shardFolderNameTemplate: options.shardFolderNameTemplate,
          producerPhaseName: options.producerPhaseName,
          producerTaskName: options.producerTaskName,
          abortSignal: controller.signal
        });
        events.push('acquire');
        let released: boolean = false;
        return {
          prepareAsync: async () => {
            expect(released).toBe(false);
            events.push('prepare');
            await invalidateShardFileAsync(filename);
          },
          collateAsync: async (result) => {
            expect(released).toBe(false);
            events.push('collate');
            await writeShardFileAtomicallyAsync(
              filename,
              JSON.stringify({
                diagnosticCount,
                itemCount: result.itemCount,
                success: diagnosticCount === 0
              }),
              `${filename}.tmp`,
              context.abortSignal
            );
            afterPublication?.();
            return { diagnosticCount };
          },
          release: () => {
            expect(released).toBe(false);
            released = true;
            events.push('release');
          }
        };
      }
    };
  }

  it.each([1, 2])('retains a completed workload-failure report with %p diagnostics', async (count) => {
    await expect(collateShardsAsync(options, createAdapter(count), controller.signal)).resolves.toEqual({
      diagnosticCount: count
    });
    expect(JSON.parse(await fs.readFile(filename, 'utf8'))).toEqual({
      diagnosticCount: count,
      itemCount: 1,
      success: false
    });
    expect(events).toEqual(['acquire', 'prepare', 'collate', 'release']);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity])(
    'invalidates an unsafe or reduced adapter count %p',
    async (count) => {
      await expect(collateShardsAsync(options, createAdapter(count), controller.signal)).rejects.toThrow(
        /adapter verdict/
      );
      await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
      expect(events).toEqual(['acquire', 'prepare', 'collate', 'prepare', 'release']);
    }
  );

  it.each(['cancellation', 'infrastructure'] as const)(
    'cleans %s failure after publication before releasing',
    async (mode) => {
      const adapter = createAdapter(1, () => {
        if (mode === 'cancellation') controller.abort(new Error('cancelled publication'));
        else throw new Error('infrastructure failure');
      });
      await expect(collateShardsAsync(options, adapter, controller.signal)).rejects.toThrow(
        mode === 'cancellation' ? 'cancelled publication' : 'infrastructure failure'
      );
      await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
      expect(events).toEqual(['acquire', 'prepare', 'collate', 'prepare', 'release']);
    }
  );

  it('removes previous success even when already cancelled', async () => {
    controller.abort(new Error('cancelled before preparation'));
    await expect(collateShardsAsync(options, createAdapter(), controller.signal)).rejects.toThrow(
      'cancelled before preparation'
    );
    await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
    expect(events).toEqual(['acquire', 'prepare', 'release']);
  });

  it.each([
    { shardParentFolderPath: '' },
    { shardCount: 0 },
    { producerPhaseName: 'other' },
    { producerTaskName: 'other' },
    { shardFolderNameTemplate: 'other-{shardIndex}' }
  ])('invalidates before rejecting invocation context %j', async (overrides) => {
    options = { ...options, ...overrides };
    await expect(collateShardsAsync(options, createAdapter(), controller.signal)).rejects.toThrow();
    await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
    expect(events).toEqual(['acquire', 'prepare', 'release']);
  });

  it('invalidates before reading corrupt inputs', async () => {
    await fs.writeFile(getShardManifestPath(path.join(folder, 'shards', '1', 'test', 'example')), '{invalid');
    await expect(collateShardsAsync(options, createAdapter(), controller.signal)).rejects.toThrow(
      /Error reading/
    );
    await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
    expect(events).toEqual(['acquire', 'prepare', 'release']);
  });

  it.each(['outside', 'root'] as const)('rejects %s input paths after preparation', async (kind) => {
    options.shardParentFolderPath = kind === 'root' ? folder : path.dirname(folder);
    await expect(collateShardsAsync(options, createAdapter(), controller.signal)).rejects.toThrow(
      /below the build folder|symbolic link/
    );
    await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
    expect(events).toEqual(['acquire', 'prepare', 'release']);
  });

  it('does not invalidate outputs when acquisition fails', async () => {
    const contents = await fs.readFile(filename, 'utf8');
    await expect(
      collateShardsAsync(
        options,
        {
          acquireAsync: async () => {
            throw new Error('already owned');
          }
        },
        controller.signal
      )
    ).rejects.toThrow('already owned');
    expect(await fs.readFile(filename, 'utf8')).toBe(contents);
  });

  it('releases ownership even when initial preparation fails', async () => {
    const base = createAdapter();
    await expect(
      collateShardsAsync(
        options,
        {
          acquireAsync: async (context) => ({
            ...(await base.acquireAsync(context)),
            prepareAsync: async () => {
              throw new Error('cannot invalidate');
            }
          })
        },
        controller.signal
      )
    ).rejects.toThrow('cannot invalidate');
    expect(events).toEqual(['acquire', 'release']);
  });

  it('preserves both publication and cleanup failures while still releasing', async () => {
    const publicationError = new Error('publication failed');
    const cleanupError = new Error('cleanup failed');
    const base = createAdapter(1, () => {
      throw publicationError;
    });
    let prepared = false;
    const run = collateShardsAsync(
      options,
      {
        acquireAsync: async (context) => {
          const session = await base.acquireAsync(context);
          return {
            ...session,
            prepareAsync: async () => {
              if (prepared) throw cleanupError;
              prepared = true;
              await session.prepareAsync();
            }
          };
        }
      },
      controller.signal
    );
    await expect(run).rejects.toMatchObject({ errors: [publicationError, cleanupError] });
    await expect(run).rejects.toThrow(/publication failed[\s\S]*cleanup failed/);
    expect(events.at(-1)).toBe('release');
  });

  it('transfers ownership across the runner return for outer cancellation cleanup', async () => {
    let transferred: IShardCollationSession | undefined;
    await collateShardsAsync(
      {
        ...options,
        onSessionAcquired: (session) => {
          transferred = session;
        }
      },
      createAdapter(),
      controller.signal
    );
    expect(events).toEqual(['acquire', 'prepare', 'collate']);
    controller.abort(new Error('outer cancellation'));
    if (!transferred) throw new Error('Session was not transferred.');
    await transferred.prepareAsync();
    await expect(fs.readFile(filename)).rejects.toThrow(/ENOENT/);
    transferred.release();
    expect(events).toEqual(['acquire', 'prepare', 'collate', 'prepare', 'release']);
  });

  it('retains publication and cleanup failures when release also fails', async () => {
    const publicationError = new Error('publication failed');
    const cleanupError = new Error('cleanup failed');
    const releaseError = new Error('release failed');
    let preparations = 0;
    const release = jest.fn(() => {
      throw releaseError;
    });
    const run = collateShardsAsync(
      options,
      {
        acquireAsync: async () => ({
          prepareAsync: async () => {
            if (preparations++ > 0) throw cleanupError;
          },
          collateAsync: async () => {
            throw publicationError;
          },
          release
        })
      },
      controller.signal
    );
    await expect(run).rejects.toMatchObject({
      errors: [{ errors: [publicationError, cleanupError] }, releaseError]
    });
    await expect(run).rejects.toThrow(/publication failed[\s\S]*cleanup failed[\s\S]*release failed/);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('propagates a standalone release failure after successful collation', async () => {
    const releaseError = new Error('release failed');
    const base = createAdapter();
    const release = jest.fn(() => {
      throw releaseError;
    });
    await expect(
      collateShardsAsync(
        options,
        {
          acquireAsync: async (context) => ({ ...(await base.acquireAsync(context)), release })
        },
        controller.signal
      )
    ).rejects.toBe(releaseError);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('renders nested aggregate details without recursing through cycles or replacing original errors', () => {
    const leaf = new Error('release EPERM: claim.lock');
    const aggregate = new AggregateError([leaf], 'ownership release failed');
    aggregate.errors.push(aggregate);
    const error = createShardCollationError([aggregate], 'collation failed');
    expect(error.errors).toEqual([aggregate]);
    expect(error.message).toContain('release EPERM: claim.lock');
    expect(error.message.match(/ownership release failed/g)).toHaveLength(1);
  });
});
