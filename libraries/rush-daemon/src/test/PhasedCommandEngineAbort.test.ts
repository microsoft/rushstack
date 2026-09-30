// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import {
  CobuildConfiguration,
  PhasedCommandEngine,
  ProjectChangeAnalyzer,
  type GetInputsSnapshotAsyncFn,
  type IPhasedCommandEngine
} from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import { NoOpTerminalProvider } from '@rushstack/terminal';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

const STEP_PREFIX: string = 'rush:phasedScriptAction:';

/** The steps that the native preparation measures for the fixture's `build`, in their order. */
const STEPS: ReadonlyArray<string> = [
  'checkInstallFlag',
  'doBeforeTask',
  'applyStandardPlugins',
  'configureBuildCache',
  'getSelectedProjects',
  'applySituationalPlugins',
  'loadProjectConfigurations',
  'createOperations',
  'analyzeRepoState',
  'executionManager'
];

/**
 * Each step after which the preparation checks its signal, with the number of times that the cobuild configuration
 * is cleaned up once the signal aborts as the step ends. The build cache step loads that configuration.
 */
const CHECKED_STEPS: ReadonlyArray<[string, number]> = [
  ['checkInstallFlag', 0],
  ['applyStandardPlugins', 0],
  ['configureBuildCache', 1],
  ['applySituationalPlugins', 1],
  ['loadProjectConfigurations', 1],
  ['createOperations', 1],
  ['analyzeRepoState', 1],
  ['executionManager', 1]
];

interface IPreparation {
  readonly command: PhasedCommandEngine;
  readonly controller: AbortController;
  readonly reason: Error;
  /** The folder of the repository lock. */
  readonly lockFolder: string;
  /** The steps measured so far. */
  readonly steps: string[];
  readonly destroyLockProvider: jest.Mock<Promise<void>, []>;
}

/** Parses `build`, recording each step and aborting the preparation's signal as `abortAfter` ends. */
async function parseAsync(fixture: DaemonGraphTestFixture, abortAfter?: string): Promise<IPreparation> {
  const configuration = fixture.session.rushConfiguration;
  const controller: AbortController = new AbortController();
  const reason: Error = new Error('The background preparation was cancelled.');
  const steps: string[] = [];
  const measure: typeof performance.measure = performance.measure;
  jest.spyOn(performance, 'measure').mockImplementation(function (
    this: typeof performance,
    ...args: Parameters<typeof performance.measure>
  ): ReturnType<typeof performance.measure> {
    const entry: ReturnType<typeof performance.measure> = measure.apply(this, args);
    const [name] = args;
    if (name.startsWith(STEP_PREFIX)) {
      const step: string = name.slice(STEP_PREFIX.length);
      steps.push(step);
      if (step === abortAfter) {
        controller.abort(reason);
      }
    }
    return entry;
  });
  // A cobuild configuration whose feature is off, so that its cleanup can be observed.
  const destroyLockProvider: jest.Mock<Promise<void>, []> = jest.fn(async () => {});
  jest.spyOn(CobuildConfiguration, 'tryLoadAsync').mockResolvedValue({
    cobuildFeatureEnabled: false,
    createLockProviderAsync: async () => {},
    destroyLockProviderAsync: destroyLockProvider
  } as unknown as CobuildConfiguration);
  const command: PhasedCommandEngine = await PhasedCommandEngine.parseAsync({
    argv: ['build', '--parallelism', '3'],
    cwd: configuration.rushJsonFolder,
    rushConfiguration: configuration,
    terminalProvider: new NoOpTerminalProvider()
  });
  return {
    command,
    controller,
    reason,
    lockFolder: configuration.commonTempFolder,
    steps,
    destroyLockProvider
  };
}

function expectLockFree(lockFolder: string): void {
  const lock: LockFile | undefined = LockFile.tryAcquire(lockFolder, 'rush');
  expect(lock).toBeInstanceOf(LockFile);
  lock?.release();
}

async function withFixtureAsync(test: (fixture: DaemonGraphTestFixture) => Promise<void>): Promise<void> {
  const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
  try {
    await test(fixture);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
}

describe('PhasedCommandEngine.createEngineAsync with an abort signal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates the engine through every step when the signal does not abort', () =>
    withFixtureAsync(async (fixture) => {
      const { command, controller, lockFolder, steps, destroyLockProvider } = await parseAsync(fixture);
      const engine: IPhasedCommandEngine = await command.createEngineAsync(undefined, controller.signal);
      try {
        expect(steps).toEqual(STEPS);
        expect(destroyLockProvider).not.toHaveBeenCalled();
        expectLockFree(lockFolder);
      } finally {
        await engine[Symbol.asyncDispose]();
      }
      expect(destroyLockProvider).toHaveBeenCalledTimes(1);
    }));

  it.each(CHECKED_STEPS)(
    'stops before the next step once the signal aborts as %s ends, and releases the lock it took',
    (abortAfter: string, cleanups: number) =>
      withFixtureAsync(async (fixture) => {
        const { command, controller, reason, lockFolder, steps, destroyLockProvider } = await parseAsync(
          fixture,
          abortAfter
        );
        await expect(command.createEngineAsync(undefined, controller.signal)).rejects.toBe(reason);
        expect(steps).toEqual(STEPS.slice(0, STEPS.indexOf(abortAfter) + 1));
        expect(destroyLockProvider).toHaveBeenCalledTimes(cleanups);
        expectLockFree(lockFolder);
      })
  );

  it('still takes the inputs snapshot if the signal aborts while the snapshot provider is created', () =>
    withFixtureAsync(async (fixture) => {
      const { command, controller, reason, lockFolder, steps } = await parseAsync(fixture);
      const createProviderAsync: ProjectChangeAnalyzer['_tryGetSnapshotProviderAsync'] =
        ProjectChangeAnalyzer.prototype._tryGetSnapshotProviderAsync;
      const snapshots: jest.Mock<void, []> = jest.fn();
      jest
        .spyOn(ProjectChangeAnalyzer.prototype, '_tryGetSnapshotProviderAsync')
        .mockImplementation(async function (
          this: ProjectChangeAnalyzer,
          ...args: Parameters<ProjectChangeAnalyzer['_tryGetSnapshotProviderAsync']>
        ): Promise<GetInputsSnapshotAsyncFn | undefined> {
          const getInputsSnapshotAsync: GetInputsSnapshotAsyncFn | undefined =
            await createProviderAsync.apply(this, args);
          controller.abort(reason);
          return (
            getInputsSnapshotAsync &&
            (() => {
              snapshots();
              return getInputsSnapshotAsync();
            })
          );
        });
      await expect(command.createEngineAsync(undefined, controller.signal)).rejects.toBe(reason);
      expect(snapshots).toHaveBeenCalledTimes(1);
      expect(steps).toEqual(STEPS.slice(0, STEPS.indexOf('analyzeRepoState') + 1));
      expectLockFree(lockFolder);
    }));

  it('runs no step when the signal has already aborted, and the command can still create its engine', () =>
    withFixtureAsync(async (fixture) => {
      const { command, controller, reason, lockFolder, steps } = await parseAsync(fixture);
      controller.abort(reason);
      await expect(command.createEngineAsync(undefined, controller.signal)).rejects.toBe(reason);
      expect(steps).toEqual([]);
      expectLockFree(lockFolder);
      const engine: IPhasedCommandEngine = await command.createEngineAsync();
      await engine[Symbol.asyncDispose]();
      expect(steps).toEqual(STEPS);
    }));

  it('keeps holding a borrowed lock once the signal aborts', () =>
    withFixtureAsync(async (fixture) => {
      const { command, controller, reason, lockFolder } = await parseAsync(fixture, 'configureBuildCache');
      const lock: LockFile | undefined = LockFile.tryAcquire(lockFolder, 'rush');
      if (!lock) throw new Error('Expected the free repository lock.');
      try {
        await expect(command.createEngineAsync(lock, controller.signal)).rejects.toBe(reason);
        expect(lock.isReleased).toBe(false);
        expect(fs.existsSync(lock.filePath)).toBe(true);
      } finally {
        lock.release();
      }
    }));
});
