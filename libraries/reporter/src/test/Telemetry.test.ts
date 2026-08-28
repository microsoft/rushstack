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

  it('does not collect producer identities from local-sensitive or secret extension events', async () => {
    const LOCAL_PRIVATE_SOURCE: IReporterEventSource = {
      packageName: '@private/local-reporter-plugin',
      packageVersion: '1.2.3-private'
    };
    const SECRET_PRIVATE_SOURCE: IReporterEventSource = {
      packageName: '@private/secret-reporter-plugin',
      packageVersion: '4.5.6-secret'
    };
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit({
      ...rawInput('extension', { name: 'private.local.event', privateField: 'local-private-value' }),
      source: LOCAL_PRIVATE_SOURCE,
      privacy: 'local-sensitive'
    });
    manager.emit({
      ...rawInput('extension', { name: 'private.secret.event', secretField: 'secret-private-value' }),
      source: SECRET_PRIVATE_SOURCE,
      privacy: 'secret'
    });
    await manager.flushAsync();

    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    const serialized: string = JSON.stringify(aggregate);
    expect(aggregate.producerVersions).toEqual([]);
    expect(aggregate.protocolVersion).toBeUndefined();
    for (const forbidden of [
      LOCAL_PRIVATE_SOURCE.packageName,
      LOCAL_PRIVATE_SOURCE.packageVersion,
      SECRET_PRIVATE_SOURCE.packageName,
      SECRET_PRIVATE_SOURCE.packageVersion,
      'local-private-value',
      'secret-private-value'
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('projects public envelopes while preserving allowlisted diagnostic fields deterministically', async () => {
    const PUBLIC_EXTENSION_SOURCE: IReporterEventSource = {
      packageName: '@rushstack/public-reporter-plugin',
      packageVersion: '1.2.3'
    };
    const PRIVATE_FIRST_PARTY_SOURCE: IReporterEventSource = {
      packageName: '@microsoft/internal-build-plugin',
      packageVersion: '9.8.7-private'
    };
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit({
      ...rawInput('commandResult', {
        commandName: 'private-command',
        succeeded: false,
        exitCode: 97
      }),
      source: PRIVATE_FIRST_PARTY_SOURCE,
      privacy: 'local-sensitive',
      protocolVersion: { major: 7, minor: 0 }
    });
    manager.emit({
      ...rawInput('extension', { name: 'public.plugin.event' }),
      source: PUBLIC_EXTENSION_SOURCE
    });
    manager.emit(rawInput('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    manager.emit({
      ...rawInput('extension', { name: 'public.plugin.event' }),
      source: PUBLIC_EXTENSION_SOURCE
    });
    manager.emit(rawInput('diagnosticEmitted', { code: 'RUSH_OPERATION_FAILED', category: 'operation' }));
    manager.emit({
      ...rawInput('operationStatusChanged', {
        operationId: 'private-operation',
        status: 'failure'
      }),
      source: PRIVATE_FIRST_PARTY_SOURCE,
      privacy: 'local-sensitive'
    });
    manager.emit({
      ...rawInput('diagnosticEmitted', {
        code: 'RUSH_DEPENDENCY_TOOL_FAILED',
        category: 'dependency-tool',
        parameters: {
          token: { value: 'private-secret-value', privacy: 'secret' }
        }
      }),
      source: PRIVATE_FIRST_PARTY_SOURCE,
      privacy: 'secret'
    });
    manager.emit(rawInput('operationStatusChanged', { operationId: 'public-operation', status: 'success' }));
    manager.emit({
      ...rawInput('extension', { name: 'private.secret.event' }),
      source: PRIVATE_FIRST_PARTY_SOURCE,
      privacy: 'secret',
      protocolVersion: { major: 99, minor: 0 }
    });
    await manager.flushAsync();

    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    expect(aggregate).toMatchObject({
      commandName: 'build',
      result: 'succeeded',
      exitCode: 0,
      operationStatusCounts: { success: 1 },
      diagnosticCodes: ['RUSH_DEPENDENCY_TOOL_FAILED', 'RUSH_OPERATION_FAILED'],
      diagnosticCategoryCounts: { operation: 1, 'dependency-tool': 1 },
      protocolVersion: { major: 1, minor: 0 },
      producerVersions: ['@microsoft/rush-lib@5.177.2', '@rushstack/public-reporter-plugin@1.2.3']
    });
    const serialized: string = JSON.stringify(aggregate);
    for (const forbidden of [
      PRIVATE_FIRST_PARTY_SOURCE.packageName,
      PRIVATE_FIRST_PARTY_SOURCE.packageVersion,
      'private-command',
      'private-secret-value',
      'private-operation'
    ]) {
      expect(serialized).not.toContain(forbidden);
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

  it('uses the root session completion as the final process result', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit(rawInput('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    manager.emit(rawInput('sessionCompleted', { exitCode: 1, durationMs: 2000 }));
    await manager.flushAsync();

    expect(telemetry.buildAggregate()).toMatchObject({
      commandName: 'build',
      result: 'failed',
      exitCode: 1,
      durationMs: 2000
    });
  });

  it('records command completion before later lifecycle results arrive', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit(rawInput('commandCompleted', { commandName: 'build', exitCode: 1, durationMs: 1500 }));
    await manager.flushAsync();

    expect(telemetry.buildAggregate()).toMatchObject({
      commandName: 'build',
      result: 'failed',
      exitCode: 1,
      durationMs: 1500
    });
  });

  it('counts each operation once using its final status', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit(rawInput('operationStatusChanged', { operationId: 'op1', status: 'ready' }));
    manager.emit(rawInput('operationStatusChanged', { operationId: 'op1', status: 'queued' }));
    manager.emit(rawInput('operationStatusChanged', { operationId: 'op1', status: 'executing' }));
    manager.emit(rawInput('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    manager.emit(rawInput('operationStatusChanged', { operationId: 'op2', status: 'aborted' }));
    await manager.flushAsync();

    expect(telemetry.buildAggregate().operationStatusCounts).toEqual({ success: 1, aborted: 1 });
  });

  it('does not let child session lifecycle events overwrite root command state', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit(rawInput('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
    manager.emit(rawInput('sessionCompleted', { exitCode: 1, durationMs: 2000 }));
    manager.emit(rawInput('operationStatusChanged', { operationId: 'root-op', status: 'success' }));
    manager.emit({
      ...rawInput('commandResult', { commandName: 'child-command', succeeded: true, exitCode: 0 }),
      sessionId: 'child',
      parentSessionId: 'sess'
    });
    manager.emit({
      ...rawInput('sessionCompleted', { exitCode: 0, durationMs: 25 }),
      sessionId: 'child',
      parentSessionId: 'sess'
    });
    manager.emit({
      ...rawInput('operationStatusChanged', { operationId: 'child-op', status: 'failure' }),
      sessionId: 'child',
      parentSessionId: 'sess'
    });
    await manager.flushAsync();

    expect(telemetry.buildAggregate()).toMatchObject({
      commandName: 'build',
      result: 'failed',
      exitCode: 1,
      durationMs: 2000,
      operationStatusCounts: { success: 1 }
    });
  });
});

describe('createBeforeLogAdapter', () => {
  it('projects the legacy telemetry shape and returns hook augmentations without mutating the aggregate', () => {
    const hook: LegacyBeforeLogHook = (telemetry: Record<string, unknown>) => {
      telemetry.customField = 'custom-value';
      (telemetry.extraData as Record<string, number>).countSuccess = 99;
    };
    const adapter: (aggregate: ITelemetryAggregate) => Record<string, unknown> = createBeforeLogAdapter([
      hook
    ]);

    const aggregate: ITelemetryAggregate = {
      commandName: 'build',
      result: 'succeeded',
      exitCode: 0,
      operationStatusCounts: { success: 2 },
      diagnosticCodes: [],
      diagnosticCategoryCounts: {},
      producerVersions: ['@microsoft/rush-lib@5.177.2']
    };
    const record: Record<string, unknown> = adapter(aggregate);

    expect(record).toMatchObject({
      name: 'build',
      durationInSeconds: 0,
      result: 'Succeeded',
      customField: 'custom-value',
      operationResults: {},
      extraData: {
        countAll: 2,
        countSuccess: 99,
        countSuccessWithWarnings: 0,
        countFailure: 0
      }
    });
    expect(aggregate.result).toBe('succeeded');
    expect(aggregate.operationStatusCounts).toEqual({ success: 2 });
    expect(record).not.toBe(aggregate);
  });

  it('rejects an aggregate built before command completion', () => {
    const adapter: (aggregate: ITelemetryAggregate) => Record<string, unknown> = createBeforeLogAdapter([]);
    expect(() =>
      adapter({
        operationStatusCounts: {},
        diagnosticCodes: [],
        diagnosticCategoryCounts: {},
        producerVersions: []
      })
    ).toThrow(/completed telemetry aggregate/);
  });
});
