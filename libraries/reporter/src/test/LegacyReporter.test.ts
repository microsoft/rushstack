// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  LegacyReporter,
  isLegacyEmergencyFallbackRequested,
  resolveReporterSelection,
  type IReporterEventEnvelope
} from '../index';

function ev(
  type: string,
  payload: unknown = {},
  scope?: { operationId?: string; projectName?: string }
): IReporterEventEnvelope<unknown> {
  return { type, payload, scope, required: true } as unknown as IReporterEventEnvelope<unknown>;
}

function normalizeDurations(text: string): string {
  return text.replace(/\d+\.\d+ seconds/g, 'X.XX seconds');
}

function runSuccess(): string {
  let output: string = '';
  const reporter: LegacyReporter = new LegacyReporter({
    write: (text: string) => (output += text),
    maxParallelism: 2
  });
  reporter.report(ev('commandStarted', { commandName: 'build' }));
  reporter.report(
    ev('operationRegistered', {
      operationId: 'op1',
      projectName: '@my-company/project-a',
      phaseName: 'build'
    })
  );
  reporter.report(
    ev('operationRegistered', {
      operationId: 'op2',
      projectName: '@my-company/project-b',
      phaseName: 'build'
    })
  );
  reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'executing' }));
  reporter.report(
    ev('externalOutput', { text: 'Building project-a...\nproject-a done.\n' }, { operationId: 'op1' })
  );
  reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'success', durationMs: 1230 }));
  reporter.report(ev('operationStatusChanged', { operationId: 'op2', status: 'executing' }));
  reporter.report(
    ev('externalOutput', { text: 'Building project-b...\nproject-b done.\n' }, { operationId: 'op2' })
  );
  reporter.report(ev('operationStatusChanged', { operationId: 'op2', status: 'success', durationMs: 2340 }));
  reporter.report(ev('commandCompleted', { commandName: 'build', durationMs: 3700 }));
  reporter.report(ev('commandResult', { commandName: 'build', succeeded: true, exitCode: 0 }));
  return normalizeDurations(output);
}

describe('LegacyReporter', () => {
  it('reproduces the legacy success output', () => {
    expect(runSuccess()).toMatchSnapshot();
  });

  it('reproduces the legacy failure output', () => {
    let output: string = '';
    const reporter: LegacyReporter = new LegacyReporter({
      write: (text: string) => (output += text),
      maxParallelism: 2
    });
    reporter.report(ev('commandStarted', { commandName: 'build' }));
    reporter.report(
      ev('operationRegistered', {
        operationId: 'op1',
        projectName: '@my-company/project-a',
        phaseName: 'build'
      })
    );
    reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'executing' }));
    reporter.report(
      ev(
        'externalOutput',
        { text: 'Building project-a...\nError: Command failed with exit code 1\n' },
        { operationId: 'op1' }
      )
    );
    reporter.report(ev('operationStatusChanged', { operationId: 'op1', status: 'failure', durationMs: 500 }));
    reporter.report(ev('commandCompleted', { commandName: 'build', durationMs: 750 }));
    reporter.report(ev('commandResult', { commandName: 'build', succeeded: false, exitCode: 1 }));

    expect(normalizeDurations(output)).toMatchSnapshot();
  });

  it('matches the frozen legacy output markers', () => {
    const output: string = runSuccess();
    expect(output).toContain('Starting "rush build"');
    expect(output).toContain('==[ @my-company/project-a (build) ]');
    expect(output).toContain('[ 1 of 2 ]==');
    expect(output).toContain('==[ SUCCESS: 2 operations ]');
    expect(output).toContain('These operations completed successfully:');
    expect(output).toContain('rush build (X.XX seconds)');
  });
});

describe('legacy emergency fallback', () => {
  it('detects RUSH_REPORTER=legacy case-insensitively', () => {
    expect(isLegacyEmergencyFallbackRequested({ RUSH_REPORTER: 'legacy' })).toBe(true);
    expect(isLegacyEmergencyFallbackRequested({ RUSH_REPORTER: 'LEGACY' })).toBe(true);
    expect(isLegacyEmergencyFallbackRequested({ RUSH_REPORTER: 'json' })).toBe(false);
    expect(isLegacyEmergencyFallbackRequested({})).toBe(false);
  });

  it('selects the legacy reporter through RUSH_REPORTER=legacy', () => {
    const selection = resolveReporterSelection({
      argv: ['build'],
      env: { RUSH_REPORTER: 'legacy' },
      isTTY: true
    });
    expect(selection.primaryReporter).toBe('legacy');
  });
});
