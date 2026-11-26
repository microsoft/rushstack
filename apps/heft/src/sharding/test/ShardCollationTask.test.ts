// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncParallelHook, AsyncSeriesWaterfallHook } from 'tapable';
import { DynamicCommandLineParser } from '@rushstack/ts-command-line';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { ShardCollationTask, type IShardCollationTaskOptions } from '../ShardCollationTask';
import type { IShardCollationAdapter } from '../IShardCollationAdapter';
import { invalidateShardFileAsync, writeShardFileAtomicallyAsync } from '../ShardFileSystem';
import { writeShardResultManifestAsync } from '../ShardResultManifest';
import { LoggingManager } from '../../pluginFramework/logging/LoggingManager';

function createSession(mode?: 'clean' | 'watch'): {
  session: Parameters<ShardCollationTask['register']>[0];
} {
  const parser: DynamicCommandLineParser = new DynamicCommandLineParser({
    toolFilename: 'test',
    toolDescription: 'Sharding runtime test'
  });
  return {
    session: {
      hooks: {
        run: new AsyncParallelHook(['options']),
        runIncremental: new AsyncParallelHook(['options']),
        registerFileOperations: new AsyncSeriesWaterfallHook(['operations'])
      },
      parameters: {
        watch: mode === 'watch',
        clean: mode === 'clean',
        debug: false,
        verbose: false,
        production: false,
        locales: [],
        getStringParameter: parser.getStringParameter.bind(parser),
        getIntegerParameter: parser.getIntegerParameter.bind(parser),
        getFlagParameter: parser.getFlagParameter.bind(parser),
        getStringListParameter: parser.getStringListParameter.bind(parser),
        getIntegerListParameter: parser.getIntegerListParameter.bind(parser),
        getChoiceParameter: parser.getChoiceParameter.bind(parser),
        getChoiceListParameter: parser.getChoiceListParameter.bind(parser)
      },
      logger: {
        loggerName: 'collate',
        terminal: new Terminal(new StringBufferTerminalProvider(false)),
        hasErrors: false,
        emitError: jest.fn(),
        emitWarning: jest.fn(),
        resetErrorsAndWarnings: jest.fn()
      }
    }
  };
}

const producer: IShardCollationTaskOptions = { producerPhaseName: 'test', producerTaskName: 'jest' };

function createConfiguration(folder: string): Parameters<ShardCollationTask['register']>[1] {
  return {
    buildFolderPath: folder,
    sharding: {
      mode: 'collate',
      shardParentFolder: 'shards',
      shardParentFolderPath: path.join(folder, 'shards'),
      shardFolderNameTemplate: '{shardIndex}',
      shardCount: 1
    }
  };
}

describe('Heft shard collation registration', () => {
  const adapter: IShardCollationAdapter = {
    acquireAsync: async () => {
      throw new Error('Registration must not acquire outputs.');
    }
  };

  it('installs exactly one lifecycle on the task', () => {
    const { session } = createSession();
    const runtime = new ShardCollationTask();
    runtime.register(session, createConfiguration(__dirname), adapter, producer);
    expect(session.hooks.run.taps).toHaveLength(1);
    expect(() => runtime.register(session, createConfiguration(__dirname), adapter, producer)).toThrow(
      /exactly one.*multiple/
    );
    expect(session.hooks.run.taps).toHaveLength(1);
  });

  it.each(['clean', 'watch'] as const)('rejects %s mode without registering work', (mode) => {
    const { session } = createSession(mode);
    expect(() =>
      new ShardCollationTask().register(session, createConfiguration(__dirname), adapter, producer)
    ).toThrow(/does not support watch mode or --clean/);
    expect(session.hooks.run.taps).toHaveLength(0);
  });

  it('rejects ordinary mode or unsafe producer addressing without installing hooks', () => {
    const { session } = createSession();
    const runtime = new ShardCollationTask();
    expect(() =>
      runtime.register(session, { buildFolderPath: __dirname, sharding: undefined }, adapter, producer)
    ).toThrow(/collation mode/);
    expect(() =>
      runtime.register(session, createConfiguration(__dirname), adapter, {
        ...producer,
        producerTaskName: '../other'
      })
    ).toThrow();
    expect(session.hooks.run.taps).toHaveLength(0);
  });
});

describe('Heft collation task execution', () => {
  let folder: string;
  let report: string;
  let events: string[];
  let controller: AbortController;
  let created: boolean;

  beforeEach(async () => {
    folder = path.join(__dirname, 'collation-task-fixture');
    created = false;
    await fs.mkdir(folder);
    created = true;
    report = path.join(folder, 'report.json');
    events = [];
    controller = new AbortController();
    await writeShardResultManifestAsync(path.join(folder, 'shards', '1', 'test', 'jest'), {
      version: 1,
      shardIndex: 1,
      shardCount: 1,
      status: 'completed',
      phaseName: 'test',
      startedAt: '2026-09-14T00:00:00.000Z',
      durationMs: 1,
      diagnosticCount: 0,
      itemCount: 1
    });
    await fs.writeFile(report, 'previous success');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (created) await fs.rm(folder, { recursive: true });
  });

  function createAdapter(diagnosticCount: number): IShardCollationAdapter {
    return {
      acquireAsync: async (context) => {
        events.push('acquire');
        expect(context.shardParentFolderPath).toBe(path.join(folder, 'shards'));
        expect(context).toMatchObject({
          ...producer,
          shardFolderNameTemplate: '{shardIndex}',
          shardCount: 1
        });
        return {
          prepareAsync: async () => {
            events.push('prepare');
            await invalidateShardFileAsync(report);
          },
          collateAsync: async () => {
            events.push('collate');
            await writeShardFileAtomicallyAsync(
              report,
              JSON.stringify({ diagnosticCount }),
              `${report}.tmp`,
              context.abortSignal
            );
            return { diagnosticCount };
          },
          release: () => {
            events.push('release');
          }
        };
      }
    };
  }

  function setup(diagnosticCount: number): Parameters<ShardCollationTask['register']>[0] {
    const { session } = createSession();
    new ShardCollationTask().register(
      session,
      createConfiguration(folder),
      createAdapter(diagnosticCount),
      producer
    );
    return session;
  }

  it.each([0, 2])(
    'keeps the report and emits the final %p-diagnostic verdict before release',
    async (count) => {
      const session = setup(count);
      jest.spyOn(session.logger, 'emitError').mockImplementation((error) => {
        expect(error.message).toBe('Sharded run failed with 2 diagnostics.');
        events.push('verdict');
      });
      await session.hooks.run.promise({ abortSignal: controller.signal, globAsync: async () => [] });
      expect(JSON.parse(await fs.readFile(report, 'utf8'))).toEqual({ diagnosticCount: count });
      expect(events).toEqual(
        count
          ? ['acquire', 'prepare', 'collate', 'verdict', 'release']
          : ['acquire', 'prepare', 'collate', 'release']
      );
      expect(session.logger.emitError).toHaveBeenCalledTimes(count ? 1 : 0);
    }
  );

  it.each(['cancel', 'throw'] as const)(
    'cleans a report when the outer verdict boundary will %s',
    async (mode) => {
      const session = setup(2);
      jest.spyOn(session.logger, 'emitError').mockImplementation(() => {
        events.push('verdict');
        if (mode === 'cancel') controller.abort(new Error('cancelled verdict'));
        else throw new Error('logger failed');
      });
      await expect(
        session.hooks.run.promise({ abortSignal: controller.signal, globAsync: async () => [] })
      ).rejects.toThrow(mode === 'cancel' ? 'cancelled verdict' : 'logger failed');
      await expect(fs.readFile(report)).rejects.toThrow(/ENOENT/);
      expect(events).toEqual(['acquire', 'prepare', 'collate', 'verdict', 'prepare', 'release']);
    }
  );

  it('does not fall back to a different producer task when the addressed manifest is absent', async () => {
    const session = setup(0);
    await fs.rename(
      path.join(folder, 'shards', '1', 'test', 'jest'),
      path.join(folder, 'shards', '1', 'test', 'other')
    );
    await expect(
      session.hooks.run.promise({
        abortSignal: controller.signal,
        globAsync: async () => []
      })
    ).rejects.toThrow(/no result was found/);
    await expect(fs.readFile(report)).rejects.toThrow(/ENOENT/);
    expect(events).toEqual(['acquire', 'prepare', 'release']);
  });

  it('preserves outer verdict, cleanup and release failures while releasing once', async () => {
    const verdictError = new Error('logger failed');
    const cleanupError = new Error('cleanup failed');
    const releaseError = new Error('release EPERM: report.json');
    const { session } = createSession();
    let preparations = 0;
    const release = jest.fn(() => {
      throw new AggregateError([releaseError], 'Release failed');
    });
    new ShardCollationTask().register(
      session,
      createConfiguration(folder),
      {
        acquireAsync: async () => ({
          prepareAsync: async () => {
            if (preparations++ > 0) throw cleanupError;
          },
          collateAsync: async () => ({ diagnosticCount: 2 }),
          release
        })
      },
      producer
    );
    jest.spyOn(session.logger, 'emitError').mockImplementation(() => {
      throw verdictError;
    });
    const run = session.hooks.run.promise({ abortSignal: controller.signal, globAsync: async () => [] });
    await expect(run).rejects.toMatchObject({
      errors: [verdictError, cleanupError, { errors: [releaseError] }]
    });
    const error: unknown = await run.catch((caught: unknown) => caught);
    if (!(error instanceof Error)) throw new Error('Expected a task failure.');
    expect(LoggingManager.getErrorMessage(error)).toMatch(
      /logger failed[\s\S]*cleanup failed[\s\S]*release EPERM: report.json/
    );
    expect(release).toHaveBeenCalledTimes(1);
  });
});
