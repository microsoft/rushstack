// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonFile, LockFile } from '@rushstack/node-core-library';
import type { IReporterEmitEventInput, IReporterEventSink } from '@rushstack/rush-reporter';

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { IRushConfigurationJson } from '../../api/RushConfiguration';
import {
  _getRushSessionDerivedExitStatus,
  _isRushSessionErrorRepresented
} from '../../pluginFramework/RushSession';
import { RushCommandLineParser } from '../RushCommandLineParser';

class CapturingReporterSink implements IReporterEventSink {
  public readonly events: IReporterEmitEventInput<unknown>[] = [];

  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    this.events.push(event);
    return `event-${this.events.length}`;
  }
}

function isCompletion(event: IReporterEmitEventInput<unknown>): boolean {
  return (
    event.type === 'commandResult' || event.type === 'commandCompleted' || event.type === 'sessionCompleted'
  );
}

describe('RushCommandLineParser reporter lifecycle', () => {
  const temporaryFolders: string[] = [];
  let originalExitCode: string | number | undefined;
  let originalArgv: string[];
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let lockSpy: jest.SpiedFunction<typeof LockFile.tryAcquire>;

  async function copyRepositoryAsync(): Promise<string> {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-reporter-lifecycle-'));
    temporaryFolders.push(directory);
    const repoPath: string = path.join(directory, 'repo');
    await fs.promises.cp(path.join(__dirname, 'basicAndRunBuildActionRepo'), repoPath, { recursive: true });
    return repoPath;
  }

  beforeEach(() => {
    originalExitCode = process.exitCode;
    originalArgv = process.argv;
    process.exitCode = undefined;
    process.argv = ['node', 'rush', 'custom-output'];
    EnvironmentConfiguration.reset();
    stdoutSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    lockSpy = jest.spyOn(LockFile, 'tryAcquire');
  });

  afterEach(async () => {
    for (const result of lockSpy.mock.results) {
      if (result.type === 'return' && result.value && !result.value.isReleased) {
        result.value.release();
      }
    }
    await Promise.all(
      temporaryFolders
        .splice(0)
        .map((directory) => fs.promises.rm(directory, { recursive: true, force: true }))
    );
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
    EnvironmentConfiguration.reset();
    jest.restoreAllMocks();
  });

  it.each([
    { file: 'rush.json', withClose: false },
    { file: 'rush.json', withClose: true },
    { file: 'common/config/rush/command-line.json', withClose: false },
    { file: 'common/config/rush/command-line.json', withClose: true }
  ])('reports invalid $file before fatal exit (close callback: $withClose)', async ({ file, withClose }) => {
    const repoPath: string = await copyRepositoryAsync();
    await fs.promises.writeFile(path.join(repoPath, file), '{');
    const visibleOutput: unknown[] = [];

    for (const reporting of [false, true]) {
      process.exitCode = undefined;
      EnvironmentConfiguration.reset();
      stdoutSpy.mockClear();
      stderrSpy.mockClear();
      const sink: CapturingReporterSink = new CapturingReporterSink();
      let eventsAtExit: readonly IReporterEmitEventInput<unknown>[] = [];
      let eventsAtClose: readonly IReporterEmitEventInput<unknown>[] = [];
      const exitSpy: jest.SpyInstance = jest.spyOn(process, 'exit').mockImplementation(() => {
        eventsAtExit = [...sink.events];
        return undefined as never;
      });
      const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => {
        eventsAtClose = [...sink.events];
      });
      const flushAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => undefined);
      const parser: RushCommandLineParser = new RushCommandLineParser({
        cwd: repoPath,
        reporter: reporting
          ? { eventSink: sink, sessionId: 'initialization-failure', flushAsync }
          : undefined,
        reporterCloseAsync: withClose ? closeAsync : undefined
      });

      await expect(parser.executeAsync(['custom-output'])).resolves.toBe(false);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(process.exitCode).toBe(1);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(closeAsync).toHaveBeenCalledTimes(withClose ? 1 : 0);
      expect(flushAsync).toHaveBeenCalledTimes(reporting && !withClose ? 1 : 0);
      expect(sink.events.map(({ type }) => type)).toEqual(
        reporting ? ['sessionStarted', 'diagnosticEmitted', 'sessionCompleted'] : []
      );
      expect(eventsAtExit).toEqual(sink.events);
      if (withClose) {
        expect(eventsAtClose).toEqual(sink.events);
      }
      if (reporting) {
        expect(sink.events[1].payload).toMatchObject({
          code: 'RUSH_COMMAND_FAILED',
          diagnosticId: expect.any(String)
        });
        expect(sink.events[2].payload).toMatchObject({ exitCode: 1 });
        expect(_getRushSessionDerivedExitStatus(parser.rushSession)).toEqual({
          exitCode: 1,
          outcome: 'failed'
        });
      }
      visibleOutput.push({
        stdout: stdoutSpy.mock.calls.map((args) => [...args]),
        stderr: stderrSpy.mock.calls.map((args) => [...args])
      });
      exitSpy.mockRestore();
    }

    expect(visibleOutput[1]).toEqual(visibleOutput[0]);
  });

  it('binds the native reporter terminal before configuration failure and waits for its sink flush', async () => {
    const repoPath: string = await copyRepositoryAsync();
    await fs.promises.writeFile(path.join(repoPath, 'rush.json'), '{');
    const sink: CapturingReporterSink = new CapturingReporterSink();
    const exitSpy: jest.SpyInstance = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    let releaseFlush: (() => void) | undefined;
    const flushGate: Promise<void> = new Promise((resolve) => {
      releaseFlush = resolve;
    });
    const flushAsync: jest.Mock<Promise<void>, []> = jest.fn(() => flushGate);
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: repoPath,
      reporter: {
        eventSink: sink,
        sessionId: 'native-initialization-failure',
        operationStreamEnabled: true,
        flushAsync
      }
    });
    await expect(parser.executeAsync(['custom-output'])).resolves.toBe(false);
    const exitsBeforeFlush: number = exitSpy.mock.calls.length;
    const flushCalls: number = flushAsync.mock.calls.length;
    releaseFlush!();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(exitsBeforeFlush).toBe(0);
    expect(flushCalls).toBe(1);
    expect(sink.events[0].type).toBe('sessionStarted');
    expect(sink.events[1].type).toBe('diagnosticEmitted');
    expect(sink.events.slice(2, -1)).toContainEqual(
      expect.objectContaining({
        type: 'messageEmitted',
        payload: expect.objectContaining({ severity: 'error', text: expect.stringContaining('rush.json') })
      })
    );
    expect(sink.events.at(-1)).toMatchObject({ type: 'sessionCompleted', payload: { exitCode: 1 } });
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('emits and correlates a session diagnostic when plugin initialization fails before action selection', async () => {
    const repoPath: string = await copyRepositoryAsync();
    const sink: CapturingReporterSink = new CapturingReporterSink();
    const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => undefined);
    const exitSpy: jest.SpyInstance = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: repoPath,
      reporter: { eventSink: sink, sessionId: 'plugin-initialization-failure' },
      reporterCloseAsync: closeAsync
    });
    const error: Error = new Error('plugin initialization failed');
    jest.spyOn(parser.pluginManager, 'tryInitializeUnassociatedPluginsAsync').mockRejectedValue(error);

    await expect(parser.executeAsync(['custom-output'])).resolves.toBe(false);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(sink.events.map(({ type }) => type)).toEqual([
      'sessionStarted',
      'diagnosticEmitted',
      'sessionCompleted'
    ]);
    expect(sink.events[1].scope?.commandName).toBeUndefined();
    expect(_isRushSessionErrorRepresented(parser.rushSession, error)).toBe(true);
    expect(sink.events[2].payload).toMatchObject({ exitCode: 1 });
    expect(closeAsync).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each([false, true])('awaits a real delayed public telemetry hook (reject: %s)', async (reject) => {
    const visibleErrors: unknown[] = [];
    for (const reporting of [false, true]) {
      process.exitCode = undefined;
      EnvironmentConfiguration.reset();
      stdoutSpy.mockClear();
      stderrSpy.mockClear();
      const repoPath: string = await copyRepositoryAsync();
      const rushJsonPath: string = path.join(repoPath, 'rush.json');
      const rushJson: IRushConfigurationJson = JsonFile.load(rushJsonPath);
      rushJson.telemetryEnabled = true;
      JsonFile.save(rushJson, rushJsonPath);
      const sink: CapturingReporterSink = new CapturingReporterSink();
      const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => undefined);
      const exitSpy: jest.SpyInstance = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const parser: RushCommandLineParser = new RushCommandLineParser({
        cwd: repoPath,
        reporter: reporting ? { eventSink: sink, sessionId: 'telemetry-finalization' } : undefined,
        reporterCloseAsync: reporting ? closeAsync : undefined
      });
      let markHookStarted: (() => void) | undefined;
      const hookStarted: Promise<void> = new Promise((resolve) => {
        markHookStarted = resolve;
      });
      let releaseHook: (() => void) | undefined;
      const hookReleased: Promise<void> = new Promise((resolve) => {
        releaseHook = resolve;
      });
      const failure: Error = new Error('delayed telemetry flush failed');
      const flushTelemetry: jest.Mock<Promise<void>, []> = jest.fn(async () => {
        markHookStarted!();
        await hookReleased;
        if (reject) {
          throw failure;
        }
      });
      parser.rushSession.hooks.flushTelemetry.tapPromise('DelayedTelemetry', flushTelemetry);

      const execution: Promise<boolean> = parser.executeAsync(['custom-output', '--reporter=junit']);
      await hookStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const prematureCompletions: IReporterEmitEventInput<unknown>[] = sink.events.filter(isCompletion);
      releaseHook!();
      const succeeded: boolean = await execution;

      expect(JsonFile.load(path.join(repoPath, 'custom-output-args.json'))).toEqual(['--reporter', 'junit']);
      expect(prematureCompletions).toEqual([]);
      expect(succeeded).toBe(!reject);
      expect(process.exitCode).toBe(reject ? 1 : 0);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(flushTelemetry).toHaveBeenCalledTimes(1);
      expect(closeAsync).toHaveBeenCalledTimes(reporting ? 1 : 0);
      if (reporting) {
        const completions: IReporterEmitEventInput<unknown>[] = sink.events.filter(isCompletion);
        expect(completions.map(({ type }) => type)).toEqual([
          'commandResult',
          'commandCompleted',
          'sessionCompleted'
        ]);
        for (const event of completions) {
          expect(event.payload).toMatchObject({ exitCode: reject ? 1 : 0 });
        }
        expect(completions[0].payload).toMatchObject({ succeeded: !reject });
        expect(_getRushSessionDerivedExitStatus(parser.rushSession)).toEqual({
          exitCode: reject ? 1 : 0,
          outcome: reject ? 'failed' : 'succeeded'
        });
        expect(_isRushSessionErrorRepresented(parser.rushSession, failure)).toBe(reject);
        expect(sink.events.filter(({ type }) => type === 'diagnosticEmitted')).toHaveLength(reject ? 1 : 0);
      } else {
        expect(sink.events).toEqual([]);
      }
      visibleErrors.push(stderrSpy.mock.calls.map((args) => [...args]));
      exitSpy.mockRestore();
    }

    expect(visibleErrors[1]).toEqual(visibleErrors[0]);
  });
});
