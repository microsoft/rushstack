// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  resolveExitStatus,
  resolveExitStatusFromEvents,
  getSignalExitCode,
  separateJsonControls,
  EXIT_CODE_SUCCESS,
  EXIT_CODE_FAILURE,
  type IJsonControls,
  type IReporterEventEnvelope,
  type IRushExitStatus
} from '../index';

function ev(type: string, payload: unknown): IReporterEventEnvelope<unknown> {
  return { type, payload } as unknown as IReporterEventEnvelope<unknown>;
}

describe('resolveExitStatus', () => {
  it('returns success for a clean run', () => {
    expect(resolveExitStatus({})).toEqual({ exitCode: EXIT_CODE_SUCCESS, outcome: 'succeeded' });
  });

  it('treats warning-only success as success', () => {
    // Warnings are not failures, so hasFailures stays false.
    expect(resolveExitStatus({ hasFailures: false }).exitCode).toBe(0);
  });

  it('returns failure for failures and for logical cancellation', () => {
    expect(resolveExitStatus({ hasFailures: true })).toEqual({
      exitCode: EXIT_CODE_FAILURE,
      outcome: 'failed'
    });
    expect(resolveExitStatus({ cancelled: true })).toEqual({
      exitCode: EXIT_CODE_FAILURE,
      outcome: 'cancelled'
    });
  });

  it('returns the signal-derived status, which takes precedence over failures', () => {
    const status: IRushExitStatus = resolveExitStatus({ hasFailures: true, signal: 'SIGINT' });
    expect(status.outcome).toBe('signal');
    expect(status.signal).toBe('SIGINT');
    expect(status.exitCode).toBe(130);
  });
});

describe('getSignalExitCode', () => {
  it('uses the conventional 128 + signal number', () => {
    expect(getSignalExitCode('SIGINT')).toBe(130);
    expect(getSignalExitCode('SIGTERM')).toBe(143);
  });
});

describe('resolveExitStatusFromEvents', () => {
  it('maps warning-only diagnostics with a successful result to success', () => {
    const status: IRushExitStatus = resolveExitStatusFromEvents([
      ev('diagnosticEmitted', { code: 'RUSH_X', category: 'operation', severity: 'warning' }),
      ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 })
    ]);
    expect(status.exitCode).toBe(0);
    expect(status.outcome).toBe('succeeded');
  });

  it('fails on an error diagnostic, a failed operation, or a failed result', () => {
    expect(
      resolveExitStatusFromEvents([
        ev('diagnosticEmitted', { code: 'E', category: 'internal', severity: 'error' })
      ]).exitCode
    ).toBe(1);
    expect(
      resolveExitStatusFromEvents([ev('operationStatusChanged', { operationId: 'a', status: 'failure' })])
        .exitCode
    ).toBe(1);
    expect(
      resolveExitStatusFromEvents([ev('commandResult', { commandName: 'b', succeeded: false, exitCode: 1 })])
        .exitCode
    ).toBe(1);
  });

  it('never lets the diagnostic category select the exit code', () => {
    const errorInternal: number = resolveExitStatusFromEvents([
      ev('diagnosticEmitted', { code: 'A', category: 'internal', severity: 'error' })
    ]).exitCode;
    const errorConfig: number = resolveExitStatusFromEvents([
      ev('diagnosticEmitted', { code: 'B', category: 'configuration', severity: 'error' })
    ]).exitCode;
    expect(errorInternal).toBe(errorConfig);

    const warnInternal: number = resolveExitStatusFromEvents([
      ev('diagnosticEmitted', { code: 'C', category: 'internal', severity: 'warning' })
    ]).exitCode;
    const warnConfig: number = resolveExitStatusFromEvents([
      ev('diagnosticEmitted', { code: 'D', category: 'network-auth', severity: 'warning' })
    ]).exitCode;
    expect(warnInternal).toBe(0);
    expect(warnConfig).toBe(0);
  });

  it('honors cancellation and signal state', () => {
    expect(resolveExitStatusFromEvents([], { cancelled: true }).outcome).toBe('cancelled');
    expect(resolveExitStatusFromEvents([], { signal: 'SIGTERM' }).exitCode).toBe(143);
  });
});

describe('separateJsonControls', () => {
  it('keeps command-specific --json separate from the json reporter', () => {
    expect(separateJsonControls(['list', '--json'])).toEqual<IJsonControls>({
      commandJson: true,
      reporterJson: false
    });
    expect(separateJsonControls(['build', '--reporter=json'])).toEqual<IJsonControls>({
      commandJson: false,
      reporterJson: true
    });
    expect(separateJsonControls(['build', '--reporter', 'json'])).toEqual<IJsonControls>({
      commandJson: false,
      reporterJson: true
    });
    expect(separateJsonControls(['list', '--json', '--reporter=json'])).toEqual<IJsonControls>({
      commandJson: true,
      reporterJson: true
    });
    expect(separateJsonControls(['build'])).toEqual<IJsonControls>({
      commandJson: false,
      reporterJson: false
    });
  });
});
