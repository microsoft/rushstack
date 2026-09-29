// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PerformanceEntry } from 'node:perf_hooks';

import { NoOpTerminalProvider } from '@rushstack/terminal';

import {
  PhasedCommandEngine,
  waitForTelemetryFlushAsync,
  type IPhasedCommandEngineTelemetryOptions,
  type IPhasedCommandEngineTelemetryRecord
} from '../PhasedCommandEngine';
import { RushConfiguration } from '../RushConfiguration';
import { Rush } from '../Rush';
import type { IPhase } from '../CommandLineConfiguration';
import type { ITelemetryData } from '../../logic/Telemetry';
import { Operation } from '../../logic/operations/Operation';
import { OperationStatus } from '../../logic/operations/OperationStatus';
import { MockOperationRunner } from '../../logic/operations/test/MockOperationRunner';

describe(`${PhasedCommandEngine.name} telemetry`, () => {
  let folder: string;
  let rushConfiguration: RushConfiguration;
  let operationA: Operation;
  let operationB: Operation;

  function write(name: string, value: unknown): void {
    const filename: string = path.join(folder, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(value));
  }

  async function parseAsync(...argv: string[]): Promise<PhasedCommandEngine> {
    return await PhasedCommandEngine.parseAsync({
      argv,
      cwd: folder,
      rushConfiguration,
      terminalProvider: new NoOpTerminalProvider()
    });
  }

  function createRecord(
    status: OperationStatus,
    startTime: number | undefined,
    endTime: number | undefined
  ): IPhasedCommandEngineTelemetryRecord {
    return { status, silent: false, stopwatch: { startTime, endTime }, nonCachedDurationMs: undefined };
  }

  function createOptions(
    overrides: Partial<IPhasedCommandEngineTelemetryOptions> = {}
  ): IPhasedCommandEngineTelemetryOptions {
    return {
      records: new Map([
        [operationB, createRecord(OperationStatus.Skipped, 1500, 1500)],
        [operationA, createRecord(OperationStatus.Success, 1600, 1900)]
      ]),
      succeeded: true,
      durationInSeconds: 0.4,
      timeOriginMs: 1000,
      ...overrides
    };
  }

  beforeAll(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-telemetry-')));
    write('rush.json', {
      rushVersion: Rush.version,
      npmVersion: '10.0.0',
      projectFolderMinDepth: 1,
      projects: [
        { packageName: 'a', projectFolder: 'a' },
        { packageName: 'b', projectFolder: 'b' }
      ]
    });
    write('a/package.json', {
      name: 'a',
      version: '1.0.0',
      dependencies: { b: 'workspace:*' },
      scripts: { '_phase:compile': 'node -v' }
    });
    write('b/package.json', { name: 'b', version: '1.0.0', scripts: { '_phase:compile': 'node -v' } });
    write('common/config/rush/command-line.json', {
      phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          summary: 'Build',
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        }
      ],
      parameters: [
        {
          parameterKind: 'flag',
          longName: '--production',
          description: 'A graph-affecting custom parameter',
          associatedCommands: ['build'],
          associatedPhases: ['_phase:compile']
        }
      ]
    });
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(path.join(folder, 'rush.json'));
    const phase: IPhase = { name: '_phase:compile' } as IPhase;
    operationB = new Operation({
      phase,
      project: rushConfiguration.getProjectByName('b')!,
      runner: new MockOperationRunner('b (compile)'),
      logFilenameIdentifier: 'b_compile'
    });
    operationA = new Operation({
      phase,
      project: rushConfiguration.getProjectByName('a')!,
      runner: new MockOperationRunner('a (compile)'),
      logFilenameIdentifier: 'a_compile'
    });
    operationA.addDependency(operationB);
  });

  afterAll(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it("reports the request's own parameters as one initial, non-watch execution", async () => {
    const first: PhasedCommandEngine = await parseAsync('build', '--to', 'a', '--production');
    const second: PhasedCommandEngine = await parseAsync('build', '--only', 'b');
    const firstData: ITelemetryData = first.createTelemetryData(createOptions());
    const secondData: ITelemetryData = second.createTelemetryData(createOptions());

    expect(firstData).toMatchObject({
      name: 'build',
      result: 'Succeeded',
      durationInSeconds: 0.4,
      extraData: {
        isWatch: false,
        isInitial: true,
        command_to: 'true',
        command_only: 'false',
        '--to': 'a',
        '--production': 'true',
        '--changed-projects-only': false,
        countAll: 2,
        countSuccess: 1,
        countSkipped: 1
      }
    });
    expect(secondData.extraData).toMatchObject({
      command_to: 'false',
      command_only: 'true',
      '--only': 'b',
      '--production': 'false'
    });
  });

  it('reports operation and performance entry times relative to the time origin', async () => {
    const engine: PhasedCommandEngine = await parseAsync('build');
    const data: ITelemetryData = engine.createTelemetryData(
      createOptions({
        records: new Map([
          [operationB, createRecord(OperationStatus.Aborted, 1500, undefined)],
          [operationA, createRecord(OperationStatus.Failure, 1600, 1900)]
        ]),
        succeeded: false,
        performanceEntries: [
          createMeasure('rush:daemon:queueWait', 1010, 5),
          createMeasure('rush:executionManager:executeOperations', 1600, 300)
        ]
      })
    );

    expect(data.result).toBe('Failed');
    expect(data.operationResults).toEqual({
      'b (compile)': {
        startTimestampMs: 500,
        endTimestampMs: undefined,
        nonCachedDurationMs: undefined,
        wasExecutedOnThisMachine: true,
        result: OperationStatus.Aborted,
        dependencies: []
      },
      'a (compile)': {
        startTimestampMs: 600,
        endTimestampMs: 900,
        nonCachedDurationMs: undefined,
        wasExecutedOnThisMachine: true,
        result: OperationStatus.Failure,
        dependencies: ['b (compile)']
      }
    });
    expect(JSON.parse(JSON.stringify(data.performanceEntries))).toEqual([
      { name: 'rush:daemon:queueWait', entryType: 'measure', startTime: 10, duration: 5, detail: null },
      {
        name: 'rush:executionManager:executeOperations',
        entryType: 'measure',
        startTime: 600,
        duration: 300,
        detail: null
      }
    ]);
  });

  it('adds host fields after the native fields and never falls back to process-wide entries', async () => {
    const engine: PhasedCommandEngine = await parseAsync('build');
    const data: ITelemetryData = engine.createTelemetryData(
      createOptions({ extraData: { daemon: true, requestIndex: 3, countAll: 99 } })
    );

    expect(data.extraData).toMatchObject({ daemon: true, requestIndex: 3, countAll: 99, countSuccess: 1 });
    expect(data.performanceEntries).toEqual([]);
  });
});

describe(waitForTelemetryFlushAsync.name, () => {
  it('waits for taps that settle before the timeout', async () => {
    let settled: boolean = false;
    const flushPromise: Promise<void> = new Promise((resolve) => {
      setTimeout(() => {
        settled = true;
        resolve();
      }, 20);
    });

    await expect(waitForTelemetryFlushAsync(flushPromise, 60_000)).resolves.toBe(true);
    expect(settled).toBe(true);
  });

  it('treats a failed tap as settled', async () => {
    await expect(waitForTelemetryFlushAsync(Promise.reject(new Error('upload failed')), 60_000)).resolves.toBe(
      true
    );
  });

  it('clears its timer when the taps settle first, so that the timer does not keep the process alive', async () => {
    jest.useFakeTimers();
    try {
      await expect(waitForTelemetryFlushAsync(Promise.resolve(), 60_000)).resolves.toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops waiting for taps that never settle, such as an upload over a stalled network', async () => {
    const startMs: number = Date.now();

    await expect(waitForTelemetryFlushAsync(new Promise(() => undefined), 50)).resolves.toBe(false);
    expect(Date.now() - startMs).toBeGreaterThanOrEqual(45);
  });
});

function createMeasure(name: string, startTime: number, duration: number): PerformanceEntry {
  return {
    name,
    entryType: 'measure',
    startTime,
    duration,
    detail: null,
    toJSON: () => ({ name, entryType: 'measure', startTime, duration, detail: null })
  } as PerformanceEntry;
}
