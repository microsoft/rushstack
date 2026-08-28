// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PlaintextReporter, type IReporterEventEnvelope } from '../index';

function ev(
  type: string,
  payload: unknown = {},
  scope?: { operationId?: string; projectName?: string }
): IReporterEventEnvelope<unknown> {
  return { type, payload, scope, required: true } as unknown as IReporterEventEnvelope<unknown>;
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
