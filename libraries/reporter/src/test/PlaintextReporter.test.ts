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
    capture.reporter.report(
      ev('diagnosticEmitted', { code: 'RUSH_INPUT_UNKNOWN_PROJECT', severity: 'warning' })
    );
    capture.reporter.report(ev('operationStatusChanged', { operationId: 'op2', status: 'failure' }));
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
    capture.reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));

    expect(capture.getOutput()).toMatchSnapshot();
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
