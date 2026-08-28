// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import type {
  IReporterEmitEventInput,
  IReporterEventSource,
  IReporterEventSink
} from '@rushstack/rush-reporter';
import { StringBufferTerminalProvider } from '@rushstack/terminal';

import { Rush } from '../api/Rush';
import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import { _createRushSessionForPlugin, type IRushSessionReporterOptions, RushSession } from './RushSession';

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

    expect(session.getReporter()).toBeUndefined();
    expect(session.getScopedLogger()).toBeUndefined();
    expect(session.getLogger('legacy')).toBeDefined();
    expect(session.terminalProvider).toBeInstanceOf(StringBufferTerminalProvider);
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
});
