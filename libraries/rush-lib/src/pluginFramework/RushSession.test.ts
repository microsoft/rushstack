// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import { AlreadyReportedError } from '@rushstack/node-core-library';
import type {
  IReporterEmitEventInput,
  IReporterEventSource,
  IReporterEventSink,
  IResolveExitStatusFromEventsOptions,
  IRushExitStatus,
  LifecycleEmitter
} from '@rushstack/rush-reporter';
import { createRushDiagnostic } from '@rushstack/rush-reporter';
import { StringBufferTerminalProvider } from '@rushstack/terminal';

import { Rush } from '../api/Rush';
import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import {
  _correlateRushSessionError,
  _createRushSessionForPlugin,
  _getRushSessionDerivedExitStatus,
  _getRushSessionLifecycleEmitter,
  _getRushSessionTelemetryAggregate,
  _isRushSessionErrorRepresented,
  type IRushSessionReporterOptions,
  RushSession
} from './RushSession';

class CapturingSink implements IReporterEventSink {
  public readonly inputs: IReporterEmitEventInput<unknown>[] = [];

  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    this.inputs.push(event);
    return `event-${this.inputs.length}`;
  }
}

function createSession(reporter?: IRushSessionReporterOptions): RushSession {
  return new RushSession({
    getIsDebugMode: () => false,
    terminalProvider: new StringBufferTerminalProvider(),
    reporter
  });
}

describe(RushSession.name, () => {
  it('preserves legacy APIs and returns undefined when no event sink is supplied', () => {
    const session: RushSession = createSession();
    const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: os.tmpdir() });
    const action = parser.actions.find(({ actionName }) => actionName === 'list') as unknown as
      | { reporter?: ReturnType<RushSession['getReporter']> }
      | undefined;

    expect(session.getReporter()).toBeUndefined();
    expect(session.getScopedLogger()).toBeUndefined();
    expect(session.getLogger('legacy')).toBeDefined();
    expect(session.terminalProvider).toBeInstanceOf(StringBufferTerminalProvider);
    expect(action?.reporter).toBeUndefined();
  });

  it('binds session and rush-lib source identity without exposing the sink or concrete reporters', () => {
    const sink: CapturingSink = new CapturingSink();
    const session: RushSession = createSession({ eventSink: sink, sessionId: 'session-1' });
    const scope = { commandName: 'build', projectName: '@scope/project' };
    const reporter = session.getReporter(scope);

    expect(reporter).toBeDefined();
    expect(Object.keys(reporter!).sort()).toEqual(['emitDiagnostic', 'emitExtension', 'emitMessage']);
    expect('getSink' in reporter!).toBe(false);
    expect('reporters' in reporter!).toBe(false);
    expect(Object.keys(session)).not.toContain('reporter');

    scope.commandName = 'spoofed';
    reporter!.emitMessage({ severity: 'info', text: 'hello' });

    expect(sink.inputs).toHaveLength(1);
    expect(sink.inputs[0]).toMatchObject({
      sessionId: 'session-1',
      source: {
        packageName: '@microsoft/rush-lib',
        packageVersion: Rush.version
      },
      scope: {
        commandName: 'build',
        projectName: '@scope/project'
      }
    });
    expect(sink.inputs[0]).not.toHaveProperty('eventId');
    expect(sink.inputs[0]).not.toHaveProperty('sequence');
    expect(sink.inputs[0]).not.toHaveProperty('timestamp');
    expect(sink.inputs[0]).not.toHaveProperty('required');
  });

  it('isolates plugin sources while sharing session state', () => {
    const sink: CapturingSink = new CapturingSink();
    const session: RushSession = createSession({ eventSink: sink, sessionId: 'session-2' });
    const pluginSource: IReporterEventSource = {
      packageName: '@acme/rush-plugin',
      packageVersion: '1.2.3',
      component: 'acme-plugin'
    };
    const pluginSession: RushSession = _createRushSessionForPlugin(session, () => pluginSource);

    expect(pluginSession.hooks).toBe(session.hooks);
    (pluginSource as { packageName: string }).packageName = '@acme/spoofed';
    pluginSession.getReporter({ projectName: '@scope/a' })!.emitMessage({
      severity: 'info',
      text: 'plugin'
    });
    session.getReporter({ projectName: '@scope/b' })!.emitMessage({
      severity: 'info',
      text: 'rush'
    });

    expect(sink.inputs[0]).toMatchObject({
      sessionId: 'session-2',
      source: {
        packageName: '@acme/rush-plugin',
        packageVersion: '1.2.3',
        component: 'acme-plugin'
      },
      scope: { projectName: '@scope/a' }
    });
    expect(sink.inputs[1]).toMatchObject({
      sessionId: 'session-2',
      source: {
        packageName: '@microsoft/rush-lib',
        packageVersion: Rush.version
      },
      scope: { projectName: '@scope/b' }
    });
  });

  it('rejects invalid explicitly supplied reporter options', () => {
    expect(() =>
      createSession({
        eventSink: {} as IReporterEventSink,
        sessionId: 'session-3'
      })
    ).toThrow(/eventSink/);

    expect(() => createSession({ eventSink: new CapturingSink(), sessionId: ' ' })).toThrow(/sessionId/);
  });

  it('does not resolve plugin identity when reporting is disabled', () => {
    const session: RushSession = createSession();
    const getSource = jest.fn((): IReporterEventSource => {
      throw new Error('should not resolve source');
    });

    expect(_createRushSessionForPlugin(session, getSource)).toBe(session);
    expect(getSource).not.toHaveBeenCalled();
  });

  it('binds built-in action reporters to their command name', () => {
    const sink: CapturingSink = new CapturingSink();
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: os.tmpdir(),
      reporter: { eventSink: sink, sessionId: 'session-4' }
    });
    const action = parser.actions.find(({ actionName }) => actionName === 'list') as unknown as
      | { reporter?: ReturnType<RushSession['getReporter']> }
      | undefined;

    expect(action?.reporter).toBeDefined();
    action!.reporter!.emitMessage({ severity: 'debug', text: 'action' });
    expect(sink.inputs[0].scope).toEqual({ commandName: 'list' });
  });

  it('observes shadow lifecycle, diagnostics, telemetry, and legacy correlation without terminal output', () => {
    const sink: CapturingSink = new CapturingSink();
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const session: RushSession = new RushSession({
      getIsDebugMode: () => false,
      terminalProvider,
      reporter: { eventSink: sink, sessionId: 'session-shadow' }
    });
    const emitter = _getRushSessionLifecycleEmitter(session, { commandName: 'build' })!;
    const error: AlreadyReportedError = new AlreadyReportedError();

    emitter.emitSessionStarted({ rushVersion: Rush.version });
    emitter.emitCommandStarted({ commandName: 'build' });
    emitter.emitOperationRegistered({
      operationId: '@scope/project#_phase:test',
      projectName: '@scope/project',
      phaseName: '_phase:test'
    });
    emitter.emitOperationStatusChanged({
      operationId: '@scope/project#_phase:test',
      status: 'failure'
    });
    const diagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED', {
      parameters: {
        projectName: { value: '@scope/project', privacy: 'public' }
      }
    });
    emitter.emitDiagnostic(diagnostic);
    _correlateRushSessionError(session, error, diagnostic.diagnosticId);
    emitter.emitCommandResult({ commandName: 'build', succeeded: false, exitCode: 1 });
    emitter.emitCommandCompleted({ commandName: 'build', exitCode: 1, durationMs: 25 });
    emitter.emitSessionCompleted({ exitCode: 1, durationMs: 30 });

    expect(sink.inputs.map(({ type }) => type)).toEqual([
      'sessionStarted',
      'commandStarted',
      'operationRegistered',
      'operationStatusChanged',
      'diagnosticEmitted',
      'commandResult',
      'commandCompleted',
      'sessionCompleted'
    ]);
    expect(_isRushSessionErrorRepresented(session, error)).toBe(true);
    expect(_getRushSessionDerivedExitStatus(session)).toEqual({ exitCode: 1, outcome: 'failed' });
    expect(_getRushSessionTelemetryAggregate(session)).toMatchObject({
      commandName: 'build',
      result: 'failed',
      exitCode: 1,
      operationStatusCounts: { failure: 1 },
      diagnosticCodes: ['RUSH_OPERATION_FAILED'],
      diagnosticCategoryCounts: { operation: 1 }
    });
    expect(terminalProvider.getAllOutput(false)).toEqual({
      log: '',
      warning: '',
      error: '',
      verbose: '',
      debug: ''
    });
  });

  it('preserves event order, correlation, session identity, and trusted producer identity', () => {
    const sink: CapturingSink = new CapturingSink();
    const session: RushSession = createSession({ eventSink: sink, sessionId: 'ordered-session' });
    const pluginSession: RushSession = _createRushSessionForPlugin(session, () => ({
      packageName: '@acme/rush-plugin',
      packageVersion: '1.2.3',
      component: 'acme-plugin'
    }));
    const sessionEmitter: LifecycleEmitter = _getRushSessionLifecycleEmitter(session)!;
    const commandEmitter: LifecycleEmitter = _getRushSessionLifecycleEmitter(session, {
      commandName: 'build'
    })!;
    const diagnostic = createRushDiagnostic('RUSH_COMMAND_FAILED');
    const error: Error = new Error('represented');

    sessionEmitter.emitSessionStarted({ rushVersion: Rush.version });
    commandEmitter.emitCommandStarted({ commandName: 'build' });
    pluginSession.getReporter({ commandName: 'build' })!.emitMessage({
      severity: 'info',
      text: 'plugin message'
    });
    commandEmitter.emitDiagnostic(diagnostic);
    _correlateRushSessionError(session, error, diagnostic.diagnosticId);
    commandEmitter.emitCommandResult({ commandName: 'build', succeeded: false, exitCode: 1 });
    commandEmitter.emitCommandCompleted({ commandName: 'build', exitCode: 1 });
    sessionEmitter.emitSessionCompleted({ exitCode: 1 });

    expect(sink.inputs.map(({ type }) => type)).toEqual([
      'sessionStarted',
      'commandStarted',
      'messageEmitted',
      'diagnosticEmitted',
      'commandResult',
      'commandCompleted',
      'sessionCompleted'
    ]);
    expect(new Set(sink.inputs.map(({ sessionId }) => sessionId))).toEqual(new Set(['ordered-session']));
    expect(sink.inputs[0].source).toMatchObject({
      packageName: '@microsoft/rush-lib',
      packageVersion: Rush.version
    });
    expect(sink.inputs[2].source).toEqual({
      packageName: '@acme/rush-plugin',
      packageVersion: '1.2.3',
      component: 'acme-plugin'
    });
    expect(sink.inputs[3].payload).toMatchObject({ diagnosticId: diagnostic.diagnosticId });
    expect(_isRushSessionErrorRepresented(session, error)).toBe(true);
  });

  it('derives legacy-compatible exit status for success, warnings, failures, cancellation, and errors', () => {
    const derive = (
      emitEvents: (emitter: LifecycleEmitter) => void,
      options?: IResolveExitStatusFromEventsOptions
    ): IRushExitStatus => {
      const session: RushSession = createSession({
        eventSink: new CapturingSink(),
        sessionId: 'exit-session'
      });
      emitEvents(_getRushSessionLifecycleEmitter(session, { commandName: 'build' })!);
      return _getRushSessionDerivedExitStatus(session, options)!;
    };

    expect(
      derive((emitter) => {
        emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
        emitter.emitCommandCompleted({ commandName: 'build', exitCode: 0 });
      })
    ).toEqual({ exitCode: 0, outcome: 'succeeded' });

    expect(
      derive((emitter) => {
        emitter.emitDiagnostic(createRushDiagnostic('RUSH_OPERATION_FAILED', { severity: 'warning' }));
        emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
      })
    ).toEqual({ exitCode: 0, outcome: 'succeeded' });

    expect(
      derive((emitter) => {
        emitter.emitOperationStatusChanged({ operationId: '@scope/project#_phase:build', status: 'failure' });
      })
    ).toEqual({ exitCode: 1, outcome: 'failed' });

    expect(derive(() => {}, { cancelled: true })).toEqual({ exitCode: 1, outcome: 'cancelled' });

    for (const code of ['RUSH_CONFIG_INVALID_JSON', 'RUSH_INTERNAL_UNEXPECTED'] as const) {
      expect(
        derive((emitter) => {
          emitter.emitDiagnostic(createRushDiagnostic(code));
        })
      ).toEqual({ exitCode: 1, outcome: 'failed' });
    }
  });

  it('excludes non-public plugin envelopes from the shadow telemetry projection', () => {
    const sink: CapturingSink = new CapturingSink();
    const session: RushSession = createSession({ eventSink: sink, sessionId: 'session-private' });
    const pluginSession: RushSession = _createRushSessionForPlugin(session, () => ({
      packageName: '@private/plugin',
      packageVersion: '1.0.0'
    }));

    pluginSession.getReporter()!.emitMessage({
      severity: 'info',
      text: '/local/private/path'
    });
    pluginSession.getReporter()!.emitDiagnostic(
      createRushDiagnostic('RUSH_DEPENDENCY_TOOL_FAILED', {
        parameters: {
          token: { value: 'private-secret-token', privacy: 'secret' }
        }
      })
    );
    const emitter: LifecycleEmitter = _getRushSessionLifecycleEmitter(session)!;
    emitter.emitSessionStarted({ rushVersion: Rush.version });
    emitter.emitCommandStarted({ commandName: 'build', argv: ['--auth-token=public-envelope-secret'] });
    emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });

    const aggregate = _getRushSessionTelemetryAggregate(session)!;
    expect(JSON.stringify(aggregate)).not.toContain('@private/plugin');
    expect(JSON.stringify(aggregate)).not.toContain('/local/private/path');
    expect(JSON.stringify(aggregate)).not.toContain('private-secret-token');
    expect(JSON.stringify(aggregate)).not.toContain('--auth-token=public-envelope-secret');
    expect(aggregate).toMatchObject({
      commandName: 'build',
      result: 'succeeded',
      exitCode: 0
    });
    expect(aggregate.producerVersions).toEqual([`@microsoft/rush-lib@${Rush.version}`]);
  });
});
