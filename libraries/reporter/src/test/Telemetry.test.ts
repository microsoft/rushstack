// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TelemetrySubscriber,
  createTelemetryReporter,
  createBeforeLogAdapter,
  REPORTER_PERFORMANCE_BUDGETS,
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

interface IForeignEnvelopeOptions {
  readonly privacy?: IReporterEventEnvelope<unknown>['privacy'];
  readonly source?: IReporterEventSource;
  readonly protocolVersion?: IReporterEventEnvelope<unknown>['protocolVersion'];
  readonly parentSessionId?: string;
}

function foreignEnvelope(
  sequence: number,
  type: IReporterEventEnvelope<unknown>['type'],
  payload: unknown,
  options: IForeignEnvelopeOptions = {}
): IReporterEventEnvelope<unknown> {
  return {
    protocolVersion: options.protocolVersion ?? { major: 1, minor: 0 },
    eventId: `foreign_${sequence}`,
    sessionId: 'foreign-session',
    parentSessionId: options.parentSessionId,
    sequence,
    timestamp: '2026-08-28T00:00:00.000Z',
    source: options.source ?? {
      packageName: '@foreign/reporter-plugin',
      packageVersion: '1.0.0'
    },
    privacy: options.privacy ?? 'public',
    required: true,
    type,
    payload
  };
}

function foreignDiagnosticEnvelope(
  sequence: number,
  privacy: IReporterEventEnvelope<unknown>['privacy'],
  payload: unknown,
  options: Omit<IForeignEnvelopeOptions, 'privacy'> = {}
): IReporterEventEnvelope<unknown> {
  return foreignEnvelope(sequence, 'diagnosticEmitted', payload, { ...options, privacy });
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

  it('rejects hostile non-public diagnostic fields from foreign envelopes', async () => {
    const TOKEN_CODE: string = 'ghp_super_secret_token';
    const TOKEN_CATEGORY: string = 'token=super-secret-value';
    const PATH_CODE: string = '/home/user/private/.npmrc';
    const PATH_CATEGORY: string = 'C:\\Users\\private\\rush.json';
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(1, 'local-sensitive', {
        code: PATH_CODE,
        category: TOKEN_CATEGORY
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(2, 'secret', {
        code: TOKEN_CODE,
        category: PATH_CATEGORY
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(3, 'local-sensitive', {
        code: 'RUSH_OPERATION_FAILED',
        category: 'network-auth'
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(4, 'secret', {
        code: 'RUSH_DEPENDENCY_TOOL_FAILED',
        category: 'configuration'
      })
    );
    await manager.flushAsync();

    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    expect(aggregate.diagnosticCodes).toEqual(['RUSH_DEPENDENCY_TOOL_FAILED', 'RUSH_OPERATION_FAILED']);
    expect(aggregate.diagnosticCategoryCounts).toEqual({
      'dependency-tool': 1,
      operation: 1
    });
    expect(Object.keys(aggregate.diagnosticCategoryCounts)).toEqual(['dependency-tool', 'operation']);
    const serialized: string = JSON.stringify(aggregate);
    for (const forbidden of [TOKEN_CODE, TOKEN_CATEGORY, PATH_CODE, PATH_CATEGORY]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('preserves allowlisted diagnostics across mixed privacy ordering', async () => {
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(1, 'secret', {
        code: 'RUSH_DEPENDENCY_TOOL_FAILED',
        category: 'dependency-tool'
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(2, 'public', {
        code: 'RUSH_OPERATION_FAILED',
        category: 'operation'
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(3, 'local-sensitive', {
        code: 'RUSH_CONFIG_INVALID_JSON',
        category: 'configuration'
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(4, 'secret', {
        code: 'RUSH_NOT_REGISTERED_PRIVATE',
        category: 'future-private-category'
      })
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(5, 'public', {
        code: 'RUSH_FUTURE_PUBLIC_CODE',
        category: 'future-public-category'
      })
    );
    await manager.flushAsync();

    expect(telemetry.buildAggregate()).toMatchObject({
      diagnosticCodes: [
        'RUSH_CONFIG_INVALID_JSON',
        'RUSH_DEPENDENCY_TOOL_FAILED',
        'RUSH_FUTURE_PUBLIC_CODE',
        'RUSH_OPERATION_FAILED'
      ],
      diagnosticCategoryCounts: {
        configuration: 1,
        'dependency-tool': 1,
        operation: 1,
        other: 1
      }
    });
    expect(Object.keys(telemetry.buildAggregate().diagnosticCategoryCounts)).toEqual([
      'configuration',
      'dependency-tool',
      'operation',
      'other'
    ]);
  });

  it('bounds diagnostic dimensions deterministically under cardinality flooding', async () => {
    const publicCodes: string[] = [];
    for (
      let index: number = 0;
      index < REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCodes * 3;
      index++
    ) {
      publicCodes.push(`RUSH_FOREIGN_CODE${String(index).padStart(3, '0')}`);
    }
    const hostilePrivateCodes: string[] = publicCodes.map((code: string): string => `${code}_PRIVATE`);
    const payloads: Array<{
      privacy: IReporterEventEnvelope<unknown>['privacy'];
      code: string;
      category: string;
    }> = [
      ...publicCodes.map((code: string, index: number) => ({
        privacy: 'public' as const,
        code,
        category: `/private/category/${index}`
      })),
      ...hostilePrivateCodes.map((code: string, index: number) => ({
        privacy: index % 2 === 0 ? ('local-sensitive' as const) : ('secret' as const),
        code,
        category: `token-${index}`
      })),
      { privacy: 'secret', code: 'RUSH_OPERATION_FAILED', category: 'operation' },
      {
        privacy: 'local-sensitive',
        code: 'RUSH_DEPENDENCY_TOOL_FAILED',
        category: 'dependency-tool'
      }
    ];

    async function aggregatePayloads(orderedPayloads: typeof payloads): Promise<ITelemetryAggregate> {
      const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
      const manager: ReporterManager = new ReporterManager();
      manager.addReporter(createTelemetryReporter(telemetry));
      await manager.initializeAsync();
      orderedPayloads.forEach((payload, index: number) => {
        manager.ingestForeignEnvelope(
          foreignDiagnosticEnvelope(index + 1, payload.privacy, {
            code: payload.code,
            category: payload.category
          })
        );
      });
      await manager.flushAsync();
      return telemetry.buildAggregate();
    }

    const forward: ITelemetryAggregate = await aggregatePayloads(payloads);
    const reverse: ITelemetryAggregate = await aggregatePayloads([...payloads].reverse());
    expect(reverse.diagnosticCodes).toEqual(forward.diagnosticCodes);
    expect(forward.diagnosticCodes).toHaveLength(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryDiagnosticCodes);
    expect(forward.diagnosticCodes).toContain('RUSH_OPERATION_FAILED');
    expect(forward.diagnosticCodes).toContain('RUSH_DEPENDENCY_TOOL_FAILED');
    expect(forward.diagnosticCodes).not.toContain(hostilePrivateCodes[0]);
    expect(forward.diagnosticCategoryCounts).toEqual({
      other: publicCodes.length,
      operation: 1,
      'dependency-tool': 1
    });
    expect(Object.keys(forward.diagnosticCategoryCounts)).toHaveLength(3);
  });

  it('keeps protocol root-owned while attributing safe child diagnostics', async () => {
    const CHILD_PUBLIC_SOURCE: IReporterEventSource = {
      packageName: '@rushstack/heft',
      packageVersion: '1.2.19'
    };
    const CHILD_SECRET_SOURCE: IReporterEventSource = {
      packageName: '@private/child-plugin',
      packageVersion: '9.9.9-secret'
    };
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    await manager.initializeAsync();

    manager.emit(rawInput('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(
        1,
        'public',
        { code: 'RUSH_OPERATION_FAILED', category: 'operation' },
        {
          source: CHILD_PUBLIC_SOURCE,
          protocolVersion: { major: 99, minor: 1 },
          parentSessionId: 'sess'
        }
      )
    );
    manager.ingestForeignEnvelope(
      foreignDiagnosticEnvelope(
        2,
        'secret',
        { code: 'RUSH_DEPENDENCY_TOOL_FAILED', category: 'configuration' },
        {
          source: CHILD_SECRET_SOURCE,
          protocolVersion: { major: 100, minor: 0 },
          parentSessionId: 'sess'
        }
      )
    );
    await manager.flushAsync();

    expect(telemetry.buildAggregate()).toMatchObject({
      protocolVersion: { major: 1, minor: 0 },
      producerVersions: ['@microsoft/rush-lib@5.177.2', '@rushstack/heft@1.2.19'],
      diagnosticCodes: ['RUSH_DEPENDENCY_TOOL_FAILED', 'RUSH_OPERATION_FAILED'],
      diagnosticCategoryCounts: { 'dependency-tool': 1, operation: 1 }
    });
  });

  it('bounds foreign producer versions by priority, order, and entry length', async () => {
    const untrustedSources: IReporterEventSource[] = [];
    for (
      let index: number = 0;
      index < REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersions * 3;
      index++
    ) {
      untrustedSources.push({
        packageName: `@foreign/plugin-${String(index).padStart(3, '0')}`,
        packageVersion: '1.0.0'
      });
    }
    const trustedSources: IReporterEventSource[] = [
      { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
      { packageName: '@rushstack/heft', packageVersion: '1.2.19' }
    ];
    const oversizedSource: IReporterEventSource = {
      packageName: `@microsoft/${'x'.repeat(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersionLength)}`,
      packageVersion: '1.0.0'
    };
    const sources: IReporterEventSource[] = [...untrustedSources, oversizedSource, ...trustedSources];

    async function aggregateSources(
      orderedSources: readonly IReporterEventSource[]
    ): Promise<ITelemetryAggregate> {
      const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
      const manager: ReporterManager = new ReporterManager();
      manager.addReporter(createTelemetryReporter(telemetry));
      await manager.initializeAsync();
      orderedSources.forEach((source: IReporterEventSource, index: number) => {
        manager.ingestForeignEnvelope(
          foreignEnvelope(
            index + 1,
            'extension',
            { name: 'foreign.public.event' },
            {
              source,
              parentSessionId: 'sess',
              protocolVersion: { major: 50 + index, minor: 0 }
            }
          )
        );
      });
      await manager.flushAsync();
      return telemetry.buildAggregate();
    }

    const forward: ITelemetryAggregate = await aggregateSources(sources);
    const reverse: ITelemetryAggregate = await aggregateSources([...sources].reverse());
    expect(reverse.producerVersions).toEqual(forward.producerVersions);
    expect(forward.producerVersions).toHaveLength(REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersions);
    expect(forward.producerVersions).toContain('@microsoft/rush-lib@5.177.2');
    expect(forward.producerVersions).toContain('@rushstack/heft@1.2.19');
    expect(forward.producerVersions).not.toContain(
      `${oversizedSource.packageName}@${oversizedSource.packageVersion}`
    );
    for (const producerVersion of forward.producerVersions) {
      expect(producerVersion.length).toBeLessThanOrEqual(
        REPORTER_PERFORMANCE_BUDGETS.maxTelemetryProducerVersionLength
      );
    }
    expect(forward.protocolVersion).toBeUndefined();
  });

  it('does not admit producer metadata for lifecycle diagnostics with mixed privacy', async () => {
    const SECRET: string = 'mixed-privacy-secret';
    const MIXED_SOURCE: IReporterEventSource = {
      packageName: '@private/mixed-diagnostic-plugin',
      packageVersion: '1.0.0-private'
    };
    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    const recording: RecordingReporter = new RecordingReporter();
    const manager: ReporterManager = new ReporterManager();
    manager.addReporter(createTelemetryReporter(telemetry));
    manager.addReporter(recording);
    await manager.initializeAsync();
    const emitter: LifecycleEmitter = new LifecycleEmitter({
      sink: manager,
      sessionId: 'sess',
      source: MIXED_SOURCE,
      protocolVersion: { major: 7, minor: 0 }
    });

    emitter.emitDiagnostic(
      createRushDiagnostic('RUSH_OPERATION_FAILED', {
        parameters: {
          publicValue: { value: 'safe', privacy: 'public' },
          token: { value: SECRET, privacy: 'secret' }
        }
      })
    );
    await manager.flushAsync();

    expect(recording.reported[0].privacy).toBe('public');
    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    expect(aggregate.protocolVersion).toBeUndefined();
    expect(aggregate.producerVersions).toEqual([]);
    expect(aggregate.diagnosticCodes).toEqual(['RUSH_OPERATION_FAILED']);
    expect(aggregate.diagnosticCategoryCounts).toEqual({ operation: 1 });
    expect(JSON.stringify(aggregate)).not.toContain(SECRET);
    expect(JSON.stringify(aggregate)).not.toContain(MIXED_SOURCE.packageName);
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
