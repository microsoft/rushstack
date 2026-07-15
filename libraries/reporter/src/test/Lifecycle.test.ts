// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  LifecycleEmitter,
  deriveExitCodeFromEvents,
  summarizeShadowResult,
  createRushDiagnostic,
  ReporterManager,
  type IReporter,
  type IReporterEventEnvelope,
  type IReporterEventSink,
  type IReporterEventSource,
  type IShadowResultSummary
} from '../index';

class CapturingSink implements IReporterEventSink {
  public readonly inputs: Record<string, unknown>[] = [];

  public emit(event: Record<string, unknown>): string {
    this.inputs.push(event);
    return `evt_${this.inputs.length}`;
  }
}

class RecordingReporter implements IReporter {
  public readonly name: string = 'recording';
  public readonly reported: IReporterEventEnvelope<unknown>[] = [];

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this.reported.push(event);
  }

  public async flushAsync(): Promise<void> {
    /* no-op */
  }

  public async closeAsync(): Promise<void> {
    /* no-op */
  }
}

const SOURCE: IReporterEventSource = { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' };

function ev(type: string, payload: unknown): IReporterEventEnvelope<unknown> {
  return { type, payload } as unknown as IReporterEventEnvelope<unknown>;
}

describe('LifecycleEmitter', () => {
  it('emits required lifecycle events with merged scope', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: LifecycleEmitter = new LifecycleEmitter({
      sink,
      sessionId: 'sess',
      source: SOURCE,
      scope: { commandName: 'build' }
    });

    emitter.emitOperationRegistered({ operationId: 'op1', projectName: 'p', phaseName: '_phase:build' });

    expect(sink.inputs[0].type).toBe('operationRegistered');
    expect(sink.inputs[0].required).toBe(true);
    expect(sink.inputs[0].scope).toEqual({
      commandName: 'build',
      operationId: 'op1',
      projectName: 'p',
      phaseName: '_phase:build'
    });
  });

  it('emits diagnostics on the diagnosticEmitted channel with the privacy floor', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: LifecycleEmitter = new LifecycleEmitter({ sink, sessionId: 'sess', source: SOURCE });
    emitter.emitDiagnostic(
      createRushDiagnostic('RUSH_OPERATION_FAILED', {
        parameters: { logPath: { value: '/tmp/x.log', privacy: 'local-sensitive' } }
      })
    );
    expect(sink.inputs[0].type).toBe('diagnosticEmitted');
    expect(sink.inputs[0].privacy).toBe('local-sensitive');
    expect(sink.inputs[0].required).toBe(true);
  });

  it('writes nothing to stdout or stderr while events flow (shadow mode)', () => {
    const stdoutSpy: jest.SpyInstance = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const sink: CapturingSink = new CapturingSink();
      const emitter: LifecycleEmitter = new LifecycleEmitter({ sink, sessionId: 'sess', source: SOURCE });
      emitter.emitSessionStarted({ rushVersion: '5.177.2' });
      emitter.emitCommandStarted({ commandName: 'build' });
      emitter.emitDiagnostic(createRushDiagnostic('RUSH_OPERATION_FAILED'));
      emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
      emitter.emitSessionCompleted({ exitCode: 0 });

      expect(sink.inputs).toHaveLength(5);
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe('deriveExitCodeFromEvents', () => {
  it('maps a successful command, including warning-only success, to zero', () => {
    expect(
      deriveExitCodeFromEvents([
        ev('operationStatusChanged', { operationId: 'op1', status: 'successWithWarnings' }),
        ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 })
      ])
    ).toBe(0);
  });

  it('maps a failed command to its non-zero exit code', () => {
    expect(
      deriveExitCodeFromEvents([ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 })])
    ).toBe(1);
  });

  it('falls back to the sessionCompleted exit code', () => {
    expect(deriveExitCodeFromEvents([ev('sessionCompleted', { exitCode: 1 })])).toBe(1);
  });

  it('defaults to zero when no result is present', () => {
    expect(deriveExitCodeFromEvents([ev('commandStarted', { commandName: 'build' })])).toBe(0);
  });
});

describe('summarizeShadowResult', () => {
  it('aggregates operation statuses and the command result', () => {
    const summary: IShadowResultSummary = summarizeShadowResult([
      ev('operationStatusChanged', { operationId: 'a', status: 'success' }),
      ev('operationStatusChanged', { operationId: 'b', status: 'success' }),
      ev('operationStatusChanged', { operationId: 'c', status: 'fromCache' }),
      ev('operationStatusChanged', { operationId: 'd', status: 'failure' }),
      ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 })
    ]);

    expect(summary.commandName).toBe('build');
    expect(summary.succeeded).toBe(false);
    expect(summary.exitCode).toBe(1);
    expect(summary.operationCounts).toEqual({ success: 2, fromCache: 1, failure: 1 });
  });
});

describe('shadow emission parity through the manager', () => {
  it('reproduces the exit code and result summary from delivered events', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const emitter: LifecycleEmitter = new LifecycleEmitter({
      sink: manager,
      sessionId: 'sess',
      source: SOURCE,
      scope: { commandName: 'build' }
    });

    emitter.emitSessionStarted({ rushVersion: '5.177.2' });
    emitter.emitCommandStarted({ commandName: 'build' });
    emitter.emitOperationStatusChanged({ operationId: 'op1', status: 'success' });
    emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
    emitter.emitSessionCompleted({ exitCode: 0 });
    await manager.flushAsync();

    expect(deriveExitCodeFromEvents(reporter.reported)).toBe(0);
    const summary: IShadowResultSummary = summarizeShadowResult(reporter.reported);
    expect(summary.succeeded).toBe(true);
    expect(summary.operationCounts).toEqual({ success: 1 });
  });
});
