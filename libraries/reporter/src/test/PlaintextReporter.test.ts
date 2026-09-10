// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';

import { PlaintextReporter, type IReporterEventEnvelope } from '../index';

function ev(
  type: string,
  payload: unknown = {},
  scope?: { operationId?: string; projectName?: string },
  privacy: IReporterEventEnvelope<unknown>['privacy'] = 'public'
): IReporterEventEnvelope<unknown> {
  return { type, payload, scope, privacy, required: true } as unknown as IReporterEventEnvelope<unknown>;
}

interface ICapture {
  readonly reporter: PlaintextReporter;
  getOutput(): string;
}

function makeConcise(): ICapture {
  let output: string = '';
  const reporter: PlaintextReporter = new PlaintextReporter({
    write: (text: string) => {
      output += text;
    },
    variant: 'concise',
    nowMs: () => 0
  });
  return { reporter, getOutput: () => output };
}

function makeDetailed(): ICapture {
  let output: string = '';
  const reporter: PlaintextReporter = new PlaintextReporter({
    write: (text: string) => {
      output += text;
    },
    variant: 'detailed',
    nowMs: () => 0
  });
  return { reporter, getOutput: () => output };
}

describe('PlaintextReporter', () => {
  it('is append-only, uses no cursor movement, and disables color by default', () => {
    const capture: ICapture = makeConcise();
    capture.reporter.report(ev('commandStarted', { commandName: 'build' }));
    capture.reporter.report(ev('operationRegistered', { operationId: 'op1', projectName: 'project-a' }));
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    // No escape sequences of any kind (no color, no cursor movement).
    expect(capture.getOutput()).not.toContain('\u001b');
  });

  it('renders a stable concise plaintext transcript', () => {
    const capture: ICapture = makeConcise();
    capture.reporter.report(ev('commandStarted', { commandName: 'build' }));
    capture.reporter.report(ev('operationRegistered', { operationId: 'op1', projectName: 'project-a' }));
    capture.reporter.report(ev('operationRegistered', { operationId: 'op2', projectName: 'project-b' }));
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(
      ev('diagnosticEmitted', { code: 'RUSH_INPUT_UNKNOWN_PROJECT', severity: 'warning' })
    );
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op2', status: 'failure' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op2', status: 'failure' }));
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));

    expect(capture.getOutput()).toMatchSnapshot();
  });

  it('renders a stable detailed transcript with StreamCollator-like grouping', () => {
    const capture: ICapture = makeDetailed();
    capture.reporter.report(ev('commandStarted', { commandName: 'build' }));
    capture.reporter.report(
      ev('operationRegistered', { operationId: 'op1', projectName: 'project-a', phaseName: '_phase:build' })
    );
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'executing' }));
    capture.reporter.report(
      ev('externalOutput', { stream: 'stdout', text: 'Building project-a...\n' }, { operationId: 'op1' })
    );
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    expect(capture.getOutput()).toMatchSnapshot();
  });

  it('redacts secret message text', () => {
    const capture: ICapture = makeConcise();
    capture.reporter.report(
      ev('messageEmitted', { severity: 'error', text: 'TOP_SECRET_VALUE' }, undefined, 'secret')
    );

    expect(capture.getOutput()).toContain('[secret]');
    expect(capture.getOutput()).not.toContain('TOP_SECRET_VALUE');
  });

  it('renders negotiated compiler details without a duplicate raw diagnostic', () => {
    const capture: ICapture = makeDetailed();
    capture.reporter.report(
      ev('diagnosticEmitted', {
        code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
        severity: 'error',
        summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
        parameters: {
          tool: { value: 'typescript', privacy: 'public' },
          code: { value: 'TS1005', privacy: 'public' },
          message: { value: 'semicolon expected', privacy: 'local-sensitive' }
        },
        source: { kind: 'file', file: 'src/index.ts', line: 4, column: 2, toolName: 'typescript' }
      })
    );

    expect(capture.getOutput()).toContain('typescript');
    expect(capture.getOutput()).toContain('TS1005');
    expect(capture.getOutput()).toContain('src/index.ts:4:2');
    expect(capture.getOutput().match(/semicolon expected/g)).toHaveLength(1);
  });

  it('redacts secret diagnostic values and the whole secret envelope', () => {
    const capture: ICapture = makeDetailed();
    const payload = {
      code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
      severity: 'warning',
      summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
      parameters: {
        tool: { value: 'typescript', privacy: 'public' },
        code: { value: 'TS1005', privacy: 'public' },
        message: { value: 'TOP_SECRET_MESSAGE', privacy: 'secret' }
      },
      source: { kind: 'file', file: 'src/index.ts', line: 4, column: 2 }
    };
    capture.reporter.report(ev('diagnosticEmitted', payload, undefined, 'local-sensitive'));
    capture.reporter.report(
      ev(
        'diagnosticEmitted',
        { ...payload, source: { kind: 'file', file: 'TOP_SECRET_FILE' } },
        undefined,
        'secret'
      )
    );

    expect(capture.getOutput()).toContain('[secret]');
    expect(capture.getOutput()).toContain('src/index.ts:4:2');
    expect(capture.getOutput()).not.toContain('TOP_SECRET');
  });

  it('preserves partial-line chunks within grouped output', () => {
    const capture: ICapture = makeDetailed();
    capture.reporter.report(
      ev('operationRegistered', { operationId: 'op1', projectName: 'project-a', phaseName: 'build' })
    );
    capture.reporter.report(ev('externalOutput', { text: 'Building ' }, { operationId: 'op1' }));
    capture.reporter.report(ev('externalOutput', { text: 'project-a' }, { operationId: 'op1' }));
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));

    expect(capture.getOutput()).toContain('Building project-a\nproject-a: success');
    expect(capture.getOutput()).not.toContain('Building \nproject-a');
  });

  it.each([3, 0])('preserves grouped UTF-8 when the first spool write returns %s bytes', async (count) => {
    const fsModule: typeof fs = jest.requireActual('node:fs');
    const originalWrite: typeof fs.writeSync = fsModule.writeSync;
    const capture: ICapture = makeDetailed();
    const text: string = 'A\u{1f680}B\n';
    capture.reporter.report(ev('operationRegistered', { operationId: 'op', projectName: 'project' }));
    const writeSpy = jest
      .spyOn(fsModule, 'writeSync')
      .mockImplementationOnce((fd, data: string | NodeJS.ArrayBufferView) => {
        const buffer: Buffer =
          typeof data === 'string'
            ? Buffer.from(data, 'utf8')
            : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        return count === 0 ? 0 : originalWrite(fd, buffer, 0, count);
      });
    try {
      capture.reporter.report(ev('externalOutput', { text }, { operationId: 'op' }));
      capture.reporter.report(ev('operationCompleted', { operationId: 'op', status: 'success' }));
      await capture.reporter.closeAsync();
    } finally {
      writeSpy.mockRestore();
      await capture.reporter.closeAsync();
    }

    expect(capture.getOutput().split(text)).toHaveLength(2);
    expect(capture.getOutput().includes('Unable to spool')).toBe(count === 0);
    expect(capture.getOutput()).not.toContain('\ufffd');
  });

  it('does not repeat a partially persisted UTF-8 prefix when the spool then fails', async () => {
    const fsModule: typeof fs = jest.requireActual('node:fs');
    const originalWrite: typeof fs.writeSync = fsModule.writeSync;
    const capture: ICapture = makeDetailed();
    const text: string = 'A\u{1f680}B\n';
    capture.reporter.report(ev('operationRegistered', { operationId: 'op', projectName: 'project' }));
    const writeSpy = jest
      .spyOn(fsModule, 'writeSync')
      .mockImplementationOnce((fd, data: string | NodeJS.ArrayBufferView) => {
        const buffer: Buffer =
          typeof data === 'string'
            ? Buffer.from(data, 'utf8')
            : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        return originalWrite(fd, buffer, 0, 3);
      })
      .mockImplementationOnce(() => {
        throw new Error('spool full');
      });
    try {
      capture.reporter.report(ev('externalOutput', { text }, { operationId: 'op' }));
      capture.reporter.report(ev('operationCompleted', { operationId: 'op', status: 'success' }));
      await capture.reporter.closeAsync();
    } finally {
      writeSpy.mockRestore();
      await capture.reporter.closeAsync();
    }
    expect(capture.getOutput().split(text)).toHaveLength(2);
    expect(capture.getOutput()).toContain('Unable to spool');
    expect(capture.getOutput()).not.toContain('\ufffd');
  });

  it('treats duplicate active registration as idempotent', () => {
    const capture: ICapture = makeDetailed();
    const registration: IReporterEventEnvelope<unknown> = ev('operationRegistered', {
      operationId: 'op1',
      projectName: 'project-a',
      phaseName: 'build'
    });
    capture.reporter.report(ev('commandStarted', { commandName: 'build' }));
    capture.reporter.report(registration);
    capture.reporter.report(ev('externalOutput', { text: 'first\n' }, { operationId: 'op1' }));
    capture.reporter.report(registration);
    capture.reporter.report(ev('externalOutput', { text: 'second\n' }, { operationId: 'op1' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    expect(capture.getOutput()).toContain('first\nsecond\nproject-a: success');
    expect(capture.getOutput()).toContain('rush build succeeded (1/1 operations');
  });

  it('streams large grouped output from disk without retaining it in the operation record', async () => {
    const capture: ICapture = makeDetailed();
    const chunk: string = `${'x'.repeat(256 * 1024)}\n`;
    capture.reporter.report(
      ev('operationRegistered', { operationId: 'op1', projectName: 'project-a', phaseName: 'build' })
    );
    for (let index: number = 0; index < 8; index++) {
      capture.reporter.report(ev('externalOutput', { text: chunk }, { operationId: 'op1' }));
    }
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'success' }));
    await capture.reporter.closeAsync();

    expect(capture.getOutput()).toContain(`${'x'.repeat(1024)}x`);
    expect(capture.getOutput()).toContain('project-a: success');
  });

  it('omits silent operations and exposes the full log path', () => {
    const capture: ICapture = makeDetailed();
    capture.reporter.report(ev('commandStarted', { commandName: 'build' }));
    capture.reporter.report(
      ev('operationRegistered', { operationId: 'silent', projectName: 'hidden', silent: true })
    );
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'silent', status: 'aborted' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'silent', status: 'aborted' }));
    capture.reporter.report(
      ev('artifactAvailable', { role: 'log', path: '/abs/common/temp/rush-logs/build.log' })
    );
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    expect(capture.getOutput()).toContain('0/0 operations');
    expect(capture.getOutput()).toContain('Full log: /abs/common/temp/rush-logs/build.log');
    expect(capture.getOutput()).not.toContain('hidden');
  });

  it('uses operationCompleted as the authoritative final outcome', () => {
    const capture: ICapture = makeDetailed();
    capture.reporter.report(
      ev('operationRegistered', { operationId: 'op1', projectName: 'project-a', phaseName: 'build' })
    );
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success' }));
    capture.reporter.report(ev('operationCompleted', { operationId: 'op1', status: 'failure' }));

    expect(capture.getOutput()).toContain('project-a: failure');
    expect(capture.getOutput()).not.toContain('project-a: success');
  });

  it('keeps overlapping watch totals and grouped output isolated by iteration', () => {
    const capture: ICapture = makeDetailed();
    capture.reporter.report(ev('commandStarted', { commandName: 'build' }));
    capture.reporter.report(
      ev('operationRegistered', {
        iterationId: 1,
        operationId: 'op1',
        projectName: 'project-a',
        phaseName: 'build'
      })
    );
    capture.reporter.report(
      ev('operationRegistered', {
        iterationId: 1,
        operationId: 'abort',
        projectName: 'project-abort',
        phaseName: 'build'
      })
    );
    capture.reporter.report(
      ev('operationRegistered', {
        iterationId: 2,
        operationId: 'op1',
        projectName: 'project-a',
        phaseName: 'build'
      })
    );
    capture.reporter.report(
      ev('operationRegistered', {
        iterationId: 2,
        operationId: 'silent',
        projectName: 'hidden',
        silent: true
      })
    );
    capture.reporter.report(
      ev('externalOutput', { iterationId: 1, stream: 'stdout', text: 'OLD-CYCLE\n' }, { operationId: 'op1' })
    );
    capture.reporter.report(
      ev('externalOutput', { iterationId: 2, stream: 'stdout', text: 'NEW-CYCLE\n' }, { operationId: 'op1' })
    );
    capture.reporter.report(
      ev('operationCompleted', { iterationId: 1, operationId: 'op1', status: 'failure' })
    );
    capture.reporter.report(
      ev('operationCompleted', { iterationId: 1, operationId: 'abort', status: 'aborted' })
    );
    capture.reporter.report(ev('watchCycleCompleted', { iterationId: 1, succeeded: false }));
    capture.reporter.report(
      ev('operationCompleted', { iterationId: 2, operationId: 'op1', status: 'success' })
    );
    capture.reporter.report(
      ev('operationCompleted', { iterationId: 2, operationId: 'silent', status: 'noOp' })
    );
    capture.reporter.report(ev('watchCycleCompleted', { iterationId: 2, succeeded: true }));
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    expect(capture.getOutput()).toContain('Watch cycle failed (2/2 operations, 1 failed)');
    expect(capture.getOutput()).toContain('Watch cycle succeeded (1/1 operations, 0 failed)');
    expect(capture.getOutput()).toContain('rush build succeeded (1/1 operations, 0 failed)');
    expect(capture.getOutput()).not.toContain('hidden');
    expect(capture.getOutput().match(/OLD-CYCLE/g)).toHaveLength(1);
    expect(capture.getOutput().match(/NEW-CYCLE/g)).toHaveLength(1);
    expect(capture.getOutput().indexOf('OLD-CYCLE')).toBeLessThan(
      capture.getOutput().indexOf('project-a: failure')
    );
    expect(capture.getOutput().indexOf('project-a: failure')).toBeLessThan(
      capture.getOutput().indexOf('NEW-CYCLE')
    );
  });

  it('emits a compact heartbeat only after the interval elapses', () => {
    let now: number = 0;
    let output: string = '';
    const reporter: PlaintextReporter = new PlaintextReporter({
      write: (text: string) => {
        output += text;
      },
      nowMs: () => now,
      heartbeatIntervalMs: 30000
    });
    reporter.report(ev('commandStarted', { commandName: 'build' }));

    now = 10000;
    expect(reporter.emitHeartbeatIfDue()).toBe(false);
    now = 30000;
    expect(reporter.emitHeartbeatIfDue()).toBe(true);
    // Immediately after emitting, the timer resets.
    expect(reporter.emitHeartbeatIfDue()).toBe(false);

    expect(output).toContain('still running');
  });
});
