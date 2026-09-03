// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  JsonReporter,
  AiReporter,
  TelemetrySubscriber,
  type IAiFinalRecord,
  type IReporterEventEnvelope,
  type ITelemetryAggregate
} from '../index';

function ev(
  type: string,
  payload: unknown = {},
  scope?: { operationId?: string; projectName?: string },
  privacy: IReporterEventEnvelope<unknown>['privacy'] = 'public'
): IReporterEventEnvelope<unknown> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'evt',
    sessionId: 'sess',
    sequence: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy,
    required: true,
    type,
    payload,
    scope
  } as unknown as IReporterEventEnvelope<unknown>;
}

function parseLines(output: string): Record<string, unknown>[] {
  return output
    .split('\n')
    .filter((line: string) => line.length > 0)
    .map((line: string) => JSON.parse(line) as Record<string, unknown>);
}

describe('JsonReporter', () => {
  it('emits every event as a valid NDJSON record on stdout', () => {
    let output: string = '';
    const reporter: JsonReporter = new JsonReporter({ write: (text: string) => (output += text) });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    const records: Record<string, unknown>[] = parseLines(output);
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.type)).toEqual(['commandStarted', 'operationStatusChanged', 'commandResult']);
    // stdout purity: the output is only NDJSON, one record per line.
    expect(output.endsWith('\n')).toBe(true);
  });

  it('replaces an oversized record with a valid too-large marker', () => {
    let output: string = '';
    const reporter: JsonReporter = new JsonReporter({
      write: (text: string) => (output += text),
      maxRecordBytes: 512
    });
    reporter.report(ev('externalOutput', { stream: 'stdout', text: 'x'.repeat(1000) }));

    const records: Record<string, unknown>[] = parseLines(output);
    expect(records).toHaveLength(1);
    expect((records[0].payload as { name: string }).name).toBe('rush.reporter.record-too-large');
    expect(records[0]).toMatchObject({
      timestamp: '2026-01-01T00:00:00.000Z',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
      privacy: 'public',
      required: true,
      type: 'extension'
    });
    expect(Buffer.byteLength(output.trim(), 'utf8')).toBeLessThanOrEqual(512);
  });

  it('redacts secret diagnostic fields from stdout', () => {
    let output: string = '';
    const reporter: JsonReporter = new JsonReporter({ write: (text: string) => (output += text) });
    reporter.report(
      ev('diagnosticEmitted', {
        code: 'RUSH_DEPENDENCY_TOOL_FAILED',
        parameters: {
          token: { value: 'sk-secret-value', privacy: 'secret' },
          path: { value: '/tmp/log', privacy: 'local-sensitive' }
        }
      })
    );

    expect(output).not.toContain('sk-secret-value');
    expect(output).toContain('[secret]');
    expect(output).toContain('/tmp/log');
  });

  it('redacts local-sensitive message text from machine output', () => {
    let output: string = '';
    const reporter: JsonReporter = new JsonReporter({ write: (text: string) => (output += text) });
    reporter.report(
      ev('messageEmitted', { severity: 'error', text: '/private/path' }, undefined, 'local-sensitive')
    );

    expect(output).toContain('[local-sensitive]');
    expect(output).not.toContain('/private/path');
  });
});

describe('AiReporter', () => {
  function run(
    events: IReporterEventEnvelope<unknown>[],
    options?: { maxBytes?: number }
  ): {
    records: Record<string, unknown>[];
    final: IAiFinalRecord;
  } {
    let output: string = '';
    const reporter: AiReporter = new AiReporter({
      write: (text: string) => (output += text),
      maxBytes: options?.maxBytes
    });
    for (const event of events) {
      reporter.report(event);
    }
    void reporter.closeAsync();
    const records: Record<string, unknown>[] = parseLines(output);
    return { records, final: records[records.length - 1] as unknown as IAiFinalRecord };
  }

  it('fails closed when commandResult is missing', async () => {
    let output: string = '';
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text) });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    await reporter.closeAsync();

    const final: Record<string, unknown> = parseLines(output).at(-1)!;
    expect(final.result).toBe('failed');
    expect(final.exitCode).toBe(1);
  });

  it('counts secret fallback errors without rendering their text', () => {
    const { final } = run([
      ev('messageEmitted', { severity: 'error', text: 'TOP_SECRET_VALUE' }, undefined, 'secret'),
      ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 })
    ]);

    expect(final.errorCount).toBe(1);
    expect(JSON.stringify(final)).not.toContain('TOP_SECRET_VALUE');
  });

  it('uses sessionCompleted as the parser-only fallback result', () => {
    const { final } = run([
      ev('sessionStarted', { rushVersion: '5.178.1' }),
      ev('sessionCompleted', { exitCode: 0 })
    ]);

    expect(final.result).toBe('succeeded');
    expect(final.exitCode).toBe(0);
  });

  it('preserves an actionable parser error when no structured diagnostic was emitted', () => {
    const { final } = run([
      ev('commandStarted', { commandName: 'build' }),
      ev('messageEmitted', {
        severity: 'error',
        text: 'The project \"missing\" passed to \"--only\" does not exist in rush.json.'
      }),
      ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 })
    ]);

    expect(final.errorCodes).toEqual(['RUSH_COMMAND_FAILED']);
    expect(final.errorCount).toBe(1);
    expect(final.diagnostics).toEqual([
      expect.objectContaining({
        category: 'command',
        severity: 'error',
        summary: 'The project \"missing\" passed to \"--only\" does not exist in rush.json.'
      })
    ]);
  });

  it('counts fallback errors even when detailed diagnostics are disabled', async () => {
    let output: string = '';
    const reporter: AiReporter = new AiReporter({
      write: (text: string) => (output += text),
      maxDetailedDiagnostics: 0
    });
    reporter.report(ev('messageEmitted', { severity: 'error', text: 'first error' }));
    reporter.report(ev('messageEmitted', { severity: 'error', text: 'second error' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));
    await reporter.closeAsync();

    const final: IAiFinalRecord = parseLines(output).at(-1)! as unknown as IAiFinalRecord;
    expect(final.errorCount).toBe(2);
    expect(final.errorCodes).toEqual(['RUSH_COMMAND_FAILED']);
    expect(final.diagnosticCategoryCounts.command).toBe(2);
    expect(final.diagnostics).toEqual([]);
    expect(final.truncated).toBe(true);
  });

  it('emits a status record and a bounded final record with scope, codes, and log', () => {
    const { records, final } = run([
      ev('commandStarted', { commandName: 'build' }),
      ev('operationRegistered', { operationId: 'op1', projectName: 'project-a' }),
      ev('operationStatusChanged', { operationId: 'op1', status: 'failure' }),
      ev('operationCompleted', { operationId: 'op1', status: 'failure' }),
      ev('diagnosticEmitted', {
        code: 'RUSH_OPERATION_FAILED',
        category: 'operation',
        severity: 'error',
        remediation: [{ descriptionKey: 'r', command: 'rush rebuild', automatedExecutionSafety: 'safe' }]
      }),
      ev('artifactAvailable', { role: 'log', path: '/abs/rush.log', format: 'plaintext', complete: true }),
      ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 })
    ]);

    expect(records[0].kind).toBe('ai.status');
    expect(final.kind).toBe('ai.final');
    expect(final.result).toBe('failed');
    expect(final.exitCode).toBe(1);
    expect(final.scope.commandName).toBe('build');
    expect(final.scope.failedProjects).toEqual(['project-a']);
    expect(final.errorCodes).toEqual(['RUSH_OPERATION_FAILED']);
    expect(final.diagnostics[0].remediation?.[0].command).toBe('rush rebuild');
    expect(final.operationCounts).toEqual({ failure: 1 });
    expect(final.log).toEqual({ path: '/abs/rush.log', format: 'plaintext', complete: true });
  });

  it('excludes silent operations from AI result counts', () => {
    const { final } = run([
      ev('commandStarted', { commandName: 'build' }),
      ev('operationRegistered', { operationId: 'hidden', projectName: 'hidden', silent: true }),
      ev('operationStatusChanged', { operationId: 'hidden', status: 'success' }),
      ev('operationCompleted', { operationId: 'hidden', status: 'success' }),
      ev('operationRegistered', { operationId: 'visible', projectName: 'visible' }),
      ev('operationStatusChanged', { operationId: 'visible', status: 'fromCache' }),
      ev('operationCompleted', { operationId: 'visible', status: 'fromCache' }),
      ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 })
    ]);

    expect(final.operationCounts).toEqual({ fromCache: 1 });
  });

  it('keeps overlapping AI watch iterations and final recovery scope coherent', async () => {
    let output: string = '';
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text) });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(
      ev('operationRegistered', { iterationId: 1, operationId: 'op1', projectName: 'project-a' })
    );
    reporter.report(
      ev('operationRegistered', { iterationId: 1, operationId: 'abort', projectName: 'project-abort' })
    );
    reporter.report(
      ev('operationRegistered', { iterationId: 2, operationId: 'op1', projectName: 'project-a' })
    );
    reporter.report(
      ev('operationRegistered', {
        iterationId: 2,
        operationId: 'silent',
        projectName: 'hidden',
        silent: true
      })
    );
    reporter.report(ev('operationCompleted', { iterationId: 1, operationId: 'op1', status: 'failure' }));
    reporter.report(
      ev('diagnosticEmitted', {
        iterationId: 1,
        code: 'RUSH_OPERATION_FAILED',
        category: 'operation',
        severity: 'error'
      })
    );
    reporter.report(ev('operationCompleted', { iterationId: 1, operationId: 'abort', status: 'aborted' }));
    reporter.report(ev('watchCycleCompleted', { iterationId: 1, succeeded: false }));
    reporter.report(ev('operationCompleted', { iterationId: 2, operationId: 'op1', status: 'success' }));
    reporter.report(ev('operationCompleted', { iterationId: 2, operationId: 'silent', status: 'noOp' }));
    reporter.report(ev('watchCycleCompleted', { iterationId: 2, succeeded: true }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    await reporter.closeAsync();

    const records: Record<string, unknown>[] = parseLines(output);
    const cycles: Array<{
      succeeded: boolean;
      operationCounts: Record<string, number>;
      failedProjects: string[];
    }> = records.filter(({ kind }) => kind === 'ai.watchCycle') as Array<{
      succeeded: boolean;
      operationCounts: Record<string, number>;
      failedProjects: string[];
    }>;
    expect(
      cycles.map(({ succeeded, operationCounts, failedProjects }) => ({
        succeeded,
        operationCounts,
        failedProjects
      }))
    ).toEqual([
      {
        succeeded: false,
        operationCounts: { failure: 1, aborted: 1 },
        failedProjects: ['project-a']
      },
      {
        succeeded: true,
        operationCounts: { success: 1 },
        failedProjects: []
      }
    ]);
    const final: IAiFinalRecord = records.at(-1) as unknown as IAiFinalRecord;
    expect(final.operationCounts).toEqual({ success: 1 });
    expect(final.scope.failedProjects).toEqual([]);
    expect(final.errorCount).toBe(0);
    expect(final.errorCodes).toEqual([]);
    expect(final.diagnostics).toEqual([]);
  });

  it('caps detailed diagnostics at 20 and marks the record truncated', () => {
    const events: IReporterEventEnvelope<unknown>[] = [ev('commandStarted', { commandName: 'build' })];
    for (let i: number = 0; i < 25; i++) {
      events.push(ev('diagnosticEmitted', { code: `RUSH_E_${i}`, category: 'operation', severity: 'error' }));
    }
    events.push(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));

    const { final } = run(events);
    expect(final.diagnostics).toHaveLength(20);
    expect(final.truncated).toBe(true);
    expect(final.errorCount).toBe(25);
  });

  it('enforces the byte cap by trimming diagnostics', () => {
    const events: IReporterEventEnvelope<unknown>[] = [ev('commandStarted', { commandName: 'build' })];
    for (let i: number = 0; i < 10; i++) {
      events.push(
        ev('diagnosticEmitted', {
          code: `RUSH_ERROR_WITH_A_LONG_CODE_${i}`,
          category: 'operation',
          severity: 'error',
          remediation: [
            {
              descriptionKey: `remediation.step.${i}`,
              command: 'rush rebuild --verbose',
              automatedExecutionSafety: 'requires-confirmation'
            }
          ]
        })
      );
    }
    events.push(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));

    let output: string = '';
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text), maxBytes: 512 });
    for (const event of events) {
      reporter.report(event);
    }
    void reporter.closeAsync();
    const finalLine: string = output.trim().split('\n').pop() ?? '';
    expect(Buffer.byteLength(finalLine, 'utf8')).toBeLessThanOrEqual(512);
    expect((JSON.parse(finalLine) as IAiFinalRecord).truncated).toBe(true);
  });

  it('falls back to a minimal bounded record when fixed fields are oversized', () => {
    const events: IReporterEventEnvelope<unknown>[] = [
      ev('commandStarted', { commandName: 'x'.repeat(5000) }),
      ev('artifactAvailable', { role: 'log', path: `/tmp/${'y'.repeat(5000)}`, complete: true }),
      ev('commandResult', { succeeded: false, exitCode: 1 })
    ];
    let output: string = '';
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text), maxBytes: 512 });
    for (const event of events) {
      reporter.report(event);
    }
    void reporter.closeAsync();

    const finalLine: string = output.trim().split('\n').pop()!;
    const final: IAiFinalRecord = JSON.parse(finalLine) as IAiFinalRecord;
    expect(Buffer.byteLength(finalLine, 'utf8')).toBeLessThanOrEqual(512);
    expect(final.truncated).toBe(true);
    expect(final.scope.commandName).toBeUndefined();
    expect(final.log).toBeUndefined();
  });

  it('rejects an impossible final-record byte limit', () => {
    expect(() => new AiReporter({ write: () => {}, maxBytes: 511 })).toThrow(/at least 512/);
  });

  it('represents warnings by count when failures exist but details them on warning-only success', () => {
    const failing = run([
      ev('diagnosticEmitted', { code: 'RUSH_E', category: 'operation', severity: 'error' }),
      ev('diagnosticEmitted', { code: 'RUSH_W', category: 'input', severity: 'warning' }),
      ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 })
    ]);
    expect(failing.final.warningCount).toBe(1);
    expect(failing.final.diagnostics.every((d) => d.severity === 'error')).toBe(true);

    const warningOnly = run([
      ev('diagnosticEmitted', { code: 'RUSH_W', category: 'input', severity: 'warning' }),
      ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 })
    ]);
    expect(warningOnly.final.result).toBe('succeeded');
    expect(warningOnly.final.diagnostics.map((d) => d.severity)).toEqual(['warning']);
  });

  it('reports truncation only for the diagnostic bucket included in the final record', () => {
    const events: IReporterEventEnvelope<unknown>[] = [];
    for (let i: number = 0; i < 5; i++) {
      events.push(ev('diagnosticEmitted', { code: `RUSH_W_${i}`, category: 'input', severity: 'warning' }));
    }
    events.push(ev('commandResult', { succeeded: false, exitCode: 1 }));

    const { final } = run(events, { maxBytes: 1024 });
    expect(final.diagnostics).toEqual([]);
    expect(final.truncated).toBe(false);
  });

  it('excludes raw external output and keeps stdout pure JSON', () => {
    let output: string = '';
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text) });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('externalOutput', { stream: 'stdout', text: 'SENSITIVE-RAW-abc' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
    void reporter.closeAsync();

    expect(output).not.toContain('SENSITIVE-RAW-abc');
    // Every emitted line parses as JSON.
    expect(() => parseLines(output)).not.toThrow();
  });

  it('keeps the absolute log path in AI output but never in telemetry', () => {
    const logPath: string = '/home/user/.rush/logs/latest.log';
    const events: IReporterEventEnvelope<unknown>[] = [
      ev('commandStarted', { commandName: 'build' }),
      ev('artifactAvailable', { role: 'log', path: logPath, complete: true }),
      ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 })
    ];

    const { final } = run(events);
    expect(final.log?.path).toBe(logPath);

    const telemetry: TelemetrySubscriber = new TelemetrySubscriber();
    for (const event of events) {
      telemetry.ingest(event);
    }
    const aggregate: ITelemetryAggregate = telemetry.buildAggregate();
    expect(JSON.stringify(aggregate)).not.toContain(logPath);
  });
});
