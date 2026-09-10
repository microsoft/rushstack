// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';

import { JsonFile } from '@rushstack/node-core-library';
import type { IReporterEmitEventInput, IReporterEventSink, IRushDiagnostic } from '@rushstack/rush-reporter';

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { IRushConfigurationJson } from '../../api/RushConfiguration';
import {
  _getRushSessionDerivedExitStatus,
  _getRushSessionTelemetryAggregate,
  _isRushSessionErrorRepresented
} from '../../pluginFramework/RushSession';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { PhasedScriptAction } from '../scriptActions/PhasedScriptAction';
import { FlagFile } from '../../api/FlagFile';
import { RushConstants } from '../../logic/RushConstants';

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
  });

  afterEach(async () => {
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
      jest.clearAllMocks();
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
      const parser: RushCommandLineParser = new RushCommandLineParser({
        cwd: repoPath,
        reporter: reporting ? { eventSink: sink, sessionId: 'initialization-failure' } : undefined,
        reporterCloseAsync: withClose ? closeAsync : undefined
      });

      if (!withClose) {
        expect(exitSpy).toHaveBeenCalledWith(1);
      }
      await expect(parser.executeAsync(['custom-output'])).resolves.toBe(false);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(process.exitCode).toBe(1);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(closeAsync).toHaveBeenCalledTimes(withClose ? 1 : 0);
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

  it.each([false, true])('correlates a plugin initialization failure (frozen: %s)', async (frozen) => {
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
    if (frozen) {
      Object.freeze(error);
    }
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
    expect(stderrSpy.mock.calls.flat().join('\n')).toContain(error.message);
    expect(stderrSpy.mock.calls.flat().join('\n')).not.toContain('TypeError');
  });

  it.each([
    { args: ['not-a-rush-command'], message: 'not-a-rush-command' },
    { args: ['list', '--not-a-rush-option'], message: '--not-a-rush-option' }
  ])('reports one real pre-execution parse diagnostic for $args', async ({ args, message }) => {
    const repoPath: string = await copyRepositoryAsync();
    const visibleOutput: unknown[] = [];
    const stdoutWriteSpy: jest.SpyInstance = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderrWriteSpy: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    for (const reporting of [false, true]) {
      process.exitCode = undefined;
      EnvironmentConfiguration.reset();
      jest.clearAllMocks();
      const sink: CapturingReporterSink = new CapturingReporterSink();
      const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => undefined);
      const exitSpy: jest.SpyInstance = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const parser: RushCommandLineParser = new RushCommandLineParser({
        cwd: repoPath,
        reporter: reporting ? { eventSink: sink, sessionId: 'parse-failure' } : undefined,
        reporterCloseAsync: closeAsync
      });

      await expect(parser.executeAsync(args)).resolves.toBe(false);

      expect(process.exitCode).toBe(2);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(closeAsync).toHaveBeenCalledTimes(1);
      const stderr: string = stderrSpy.mock.calls.flat().join('\n');
      expect(stderr).toContain(message);
      expect(sink.events.map(({ type }) => type)).toEqual(
        reporting ? ['sessionStarted', 'diagnosticEmitted', 'sessionCompleted'] : []
      );
      if (reporting) {
        const diagnosticEvent: IReporterEmitEventInput<unknown> = sink.events[1];
        const diagnostic: IRushDiagnostic = diagnosticEvent.payload as IRushDiagnostic;
        expect(diagnostic.code).toBe('RUSH_COMMAND_FAILED');
        expect(diagnosticEvent.scope?.commandName).toBeUndefined();
        expect(diagnostic.parameters?.message).toEqual({
          value: expect.stringContaining(message),
          privacy: 'local-sensitive'
        });
        expect(stderr).toContain(diagnostic.parameters?.message.value);
        expect(_getRushSessionDerivedExitStatus(parser.rushSession)).toEqual({
          exitCode: 1,
          outcome: 'failed'
        });
      }
      visibleOutput.push({
        stdout: stdoutSpy.mock.calls.map((call) => [...call]),
        stderr: stderrSpy.mock.calls.map((call) => [...call]),
        stdoutWrites: stdoutWriteSpy.mock.calls.map(([chunk]) => chunk),
        stderrWrites: stderrWriteSpy.mock.calls.map(([chunk]) => chunk)
      });
      exitSpy.mockRestore();
    }
    expect(visibleOutput[1]).toEqual(visibleOutput[0]);
  });

  it('does not diagnose a successful help request as a parse failure', async () => {
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const sink: CapturingReporterSink = new CapturingReporterSink();
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: await copyRepositoryAsync(),
      reporter: { eventSink: sink, sessionId: 'help' }
    });

    await expect(parser.executeAsync(['--help'])).resolves.toBe(true);
    expect(sink.events.filter(({ type }) => type === 'diagnosticEmitted')).toEqual([]);
    expect(sink.events.at(-1)?.payload).toMatchObject({ exitCode: 0 });
  });

  it.each([false, true])('awaits a real delayed public telemetry hook (reject: %s)', async (reject) => {
    const visibleErrors: unknown[] = [];
    for (const reporting of [false, true]) {
      process.exitCode = undefined;
      EnvironmentConfiguration.reset();
      jest.clearAllMocks();
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

  it.each([false, true])(
    'observes a real watch cancellation without changing legacy exit (shadow: %s)',
    async (reporting) => {
      const repoPath: string = await copyRepositoryAsync();
      JsonFile.save(
        {
          commands: [
            {
              commandKind: 'bulk',
              name: 'watch-test',
              summary: 'Watch cancellation fixture',
              watchForChanges: true,
              enableParallelism: false,
              disableBuildCache: true,
              safeForSimultaneousRushProcesses: true
            }
          ]
        },
        path.join(repoPath, 'common/config/rush/command-line.json')
      );
      JsonFile.save({}, path.join(repoPath, 'common/config/rush/npm-shrinkwrap.json'));
      for (const name of ['a', 'b']) {
        JsonFile.save(
          { name, version: '1.0.0', scripts: { 'watch-test': 'node watch-test.js' } },
          path.join(repoPath, name, 'package.json')
        );
        await fs.promises.writeFile(
          path.join(repoPath, name, 'watch-test.js'),
          'process.stdout.write("watch child output\\n");\n'
        );
      }
      execFileSync('git', ['init', '--quiet'], { cwd: repoPath });
      execFileSync('git', ['add', '.'], { cwd: repoPath });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Rush test',
          '-c',
          'user.email=rush-test@example.com',
          '-c',
          'commit.gpgSign=false',
          'commit',
          '--quiet',
          '-m',
          'Initialize watch fixture'
        ],
        { cwd: repoPath }
      );
      const sink: CapturingReporterSink = new CapturingReporterSink();
      const exitSpy: jest.SpyInstance = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const watchSpy: jest.SpyInstance = jest.spyOn(fs, 'watch');
      const parser: RushCommandLineParser = new RushCommandLineParser({
        cwd: repoPath,
        reporter: reporting ? { eventSink: sink, sessionId: 'real-watch-cancellation' } : undefined
      });
      await new FlagFile(
        parser.rushConfiguration.defaultSubspace.getSubspaceTempFolderPath(),
        RushConstants.lastLinkFlagFilename,
        {}
      ).createAsync();
      const action = parser.getAction('watch-test');
      if (!(action instanceof PhasedScriptAction)) {
        throw new Error('Expected the production phased watch action');
      }
      let reachedWatchIdle: boolean = false;
      let closedWatchers: Promise<unknown>[] = [];
      parser.rushSession.hooks.runPhasedCommand.for('watch-test').tap('CancelRealWatch', (command) => {
        command.hooks.onGraphCreatedAsync.tap('CancelRealWatch', (graph) => {
          graph.hooks.onIdle.tap({ name: 'CancelRealWatch', stage: Number.MAX_SAFE_INTEGER }, () => {
            reachedWatchIdle = true;
            closedWatchers = watchSpy.mock.results.map(({ value }) => once(value as fs.FSWatcher, 'close'));
            action.sessionAbortController.abort();
          });
        });
      });
      const execution: Promise<boolean> = parser.executeAsync(['watch-test', '--verbose']);
      try {
        await expect(execution).resolves.toBe(true);
        await Promise.all(closedWatchers);
        expect(reachedWatchIdle).toBe(true);
        expect(watchSpy.mock.calls.length).toBeGreaterThan(0);
        expect(action.sessionAbortController.signal.aborted).toBe(true);
        expect(exitSpy).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(0);
        expect(_getRushSessionDerivedExitStatus(parser.rushSession)).toEqual(
          reporting ? { exitCode: 1, outcome: 'cancelled' } : undefined
        );
        if (reporting) {
          expect(sink.events.filter(isCompletion).map(({ payload }) => payload)).toEqual([
            expect.objectContaining({ succeeded: true, exitCode: 0 }),
            expect.objectContaining({ exitCode: 0 }),
            expect.objectContaining({ exitCode: 0 })
          ]);
          expect(_getRushSessionTelemetryAggregate(parser.rushSession)).toMatchObject({
            result: 'succeeded',
            exitCode: 0,
            operationStatusCounts: { success: 2 }
          });
          expect(sink.events.filter(({ type }) => type === 'diagnosticEmitted')).toEqual([]);
        }
      } finally {
        action.sessionAbortController.abort();
        await execution;
        await Promise.all(closedWatchers);
      }
    }
  );
});
