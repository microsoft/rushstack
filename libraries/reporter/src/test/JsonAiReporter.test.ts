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
  scope?: { operationId?: string; projectName?: string }
): IReporterEventEnvelope<unknown> {
  return {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'evt',
    sessionId: 'sess',
    sequence: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
    privacy: 'public',
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
      maxRecordBytes: 50
    });
    reporter.report(ev('externalOutput', { stream: 'stdout', text: 'x'.repeat(1000) }));

    const records: Record<string, unknown>[] = parseLines(output);
    expect(records).toHaveLength(1);
    expect((records[0].payload as { name: string }).name).toBe('rush.reporter.recordTooLarge');
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
    const records: Record<string, unknown>[] = parseLines(output);
    return { records, final: records[records.length - 1] as unknown as IAiFinalRecord };
  }

  it('emits a status record and a bounded final record with scope, codes, and log', () => {
    const { records, final } = run([
      ev('commandStarted', { commandName: 'build' }),
      ev('operationRegistered', { operationId: 'op1', projectName: 'project-a' }),
      ev('operationStatusChanged', { operationId: 'op1', status: 'failure' }),
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
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text), maxBytes: 400 });
    for (const event of events) {
      reporter.report(event);
    }
    const finalLine: string = output.trim().split('\n').pop() ?? '';
    expect(Buffer.byteLength(finalLine, 'utf8')).toBeLessThanOrEqual(400);
    expect((JSON.parse(finalLine) as IAiFinalRecord).truncated).toBe(true);
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

  it('excludes raw external output and keeps stdout pure JSON', () => {
    let output: string = '';
    const reporter: AiReporter = new AiReporter({ write: (text: string) => (output += text) });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(ev('externalOutput', { stream: 'stdout', text: 'SENSITIVE-RAW-abc' }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

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
