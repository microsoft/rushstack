// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TelemetrySubscriber,
  createTelemetryReporter,
  createBeforeLogAdapter,
  TELEMETRY_AGGREGATE_KEYS,
  LifecycleEmitter,
  ReporterManager,
  createRushDiagnostic,
  type IReporter,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type IReporterEventSource,
  type ITelemetryAggregate,
  type LegacyBeforeLogHook
} from '../index';

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

function rawInput(type: string, payload: unknown): IReporterEmitEventInput<unknown> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'sess',
    source: SOURCE,
    privacy: 'public',
    required: false,
    type: type as IReporterEmitEventInput<unknown>['type'],
    payload
  };
}

describe('TelemetrySubscriber', () => {
  it('produces an allowlisted aggregate from the event stream before reporter filtering', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    telemetry.setReporterMode('default');
    const manager: ReporterManager = new ReporterManager();
    const recording: RecordingReporter = new RecordingReporter();
    manager.addReporter(createTelemetryReporter(telemetry));
    manager.addReporter(recording);
    await manager.initializeAsync();

    const emitter: LifecycleEmitter = new LifecycleEmitter({
      sink: manager,
      sessionId: 'sess',
      source: SOURCE,
      scope: { commandName: 'build' }
    });
    emitter.emitCommandStarted({ commandName: 'build', argv: ['--to', 'x'] });
    emitter.emitOperationStatusChanged({ operationId: 'op1', status: 'success' });
    emitter.emitOperationStatusChanged({ operationId: 'op2', status: 'fromCache' });
    emitter.emitDiagnostic(createRushDiagnostic('RUSH_OPERATION_FAILED'));
    emitter.emitCommandCompleted({ commandName: 'build', exitCode: 0, durationMs: 1234 });
    emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
    emitter.emitSessionCompleted({ exitCode: 0, durationMs: 1500 });
    await manager.flushAsync();

    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    expect(aggregate.commandName).toBe('build');
    expect(aggregate.result).toBe('succeeded');
    expect(aggregate.exitCode).toBe(0);
    expect(aggregate.durationMs).toBe(1500);
    expect(aggregate.operationStatusCounts).toEqual({ success: 1, fromCache: 1 });
    expect(aggregate.diagnosticCodes).toEqual(['RUSH_OPERATION_FAILED']);
    expect(aggregate.diagnosticCategoryCounts).toEqual({ operation: 1 });
    expect(aggregate.reporterMode).toBe('default');
    expect(aggregate.protocolVersion).toEqual({ major: 1, minor: 0 });
    expect(aggregate.producerVersions).toEqual(['@microsoft/rush-lib@5.177.2']);

    // The subscriber runs alongside a rendering reporter and does not consume events from it.
    expect(recording.reported.length).toBeGreaterThan(0);
  });

  it('only ever contains allowlisted keys', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();
    const emitter: LifecycleEmitter = new LifecycleEmitter({
      sink: manager,
      sessionId: 'sess',
      source: SOURCE
    });
    emitter.emitCommandResult({ commandName: 'build', succeeded: true, exitCode: 0 });
    await manager.flushAsync();

    for (const key of Object.keys(telemetry.buildAggregate())) {
      expect(TELEMETRY_AGGREGATE_KEYS).toContain(key);
    }
  });

  it('never leaks messages, paths, arguments, remediation, raw output, or secret values', async () => {
    const SECRET: string = 'sk-super-secret-value';
    const LOG_PATH: string = '/home/user/secret/install.log';
    const ARG: string = '--auth-token=abc123';
    const MESSAGE: string = 'verbose diagnostic message text';
    const REMEDIATION_COMMAND: string = 'rush update --purge-and-leak';

    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    const emitter: LifecycleEmitter = new LifecycleEmitter({
      sink: manager,
      sessionId: 'sess',
      source: SOURCE
    });
    emitter.emitCommandStarted({ commandName: 'build', argv: [ARG] });
    emitter.emitDiagnostic(
      createRushDiagnostic('RUSH_DEPENDENCY_TOOL_FAILED', {
        parameters: {
          token: { value: SECRET, privacy: 'secret' },
          logPath: { value: LOG_PATH, privacy: 'local-sensitive' }
        },
        remediation: [
          { descriptionKey: 'r', command: REMEDIATION_COMMAND, automatedExecutionSafety: 'unsafe' }
        ]
      })
    );
    manager.emit(rawInput('externalOutput', { stream: 'stdout', text: `${SECRET} raw output` }));
    manager.emit(rawInput('activityChanged', { kind: 'message', severity: 'info', text: MESSAGE }));
    emitter.emitCommandResult({ commandName: 'build', succeeded: false, exitCode: 1 });
    await manager.flushAsync();

    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    const serialized: string = JSON.stringify(aggregate);
    for (const forbidden of [SECRET, LOG_PATH, ARG, MESSAGE, REMEDIATION_COMMAND]) {
      expect(serialized).not.toContain(forbidden);
    }
    // But the allowlisted diagnostic code and category are retained.
    expect(aggregate.diagnosticCodes).toEqual(['RUSH_DEPENDENCY_TOOL_FAILED']);
    expect(aggregate.diagnosticCategoryCounts).toEqual({ 'dependency-tool': 1 });
    expect(aggregate.result).toBe('failed');
    for (const key of Object.keys(aggregate)) {
      expect(TELEMETRY_AGGREGATE_KEYS).toContain(key);
    }
  });
});

describe('createBeforeLogAdapter', () => {
  it('runs legacy hooks with a plain copy of the aggregate', () => {
    const observed: Record<string, unknown>[] = [];
    const hook: LegacyBeforeLogHook = (telemetry: Record<string, unknown>) => {
      observed.push(telemetry);
    };
    const adapter: (aggregate: ITelemetryAggregate) => void = createBeforeLogAdapter([hook]);

    const aggregate: ITelemetryAggregate = {
      commandName: 'build',
      result: 'succeeded',
      exitCode: 0,
      operationStatusCounts: { success: 2 },
      diagnosticCodes: [],
      diagnosticCategoryCounts: {},
      producerVersions: ['@microsoft/rush-lib@5.177.2']
    };
    adapter(aggregate);

    expect(observed).toHaveLength(1);
    expect(observed[0]).toEqual({ ...aggregate });
    // The hook receives a copy, not the aggregate itself.
    expect(observed[0]).not.toBe(aggregate);
  });
});
