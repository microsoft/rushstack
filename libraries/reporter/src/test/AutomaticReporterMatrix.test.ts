// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  planAutomaticReporters,
  describeReporterPlan,
  isMachineReporter,
  resolveReporterSelection,
  type IAutomaticReporterPlan
} from '../index';

function plan(
  env: Record<string, string | undefined>,
  isTTY: boolean,
  argv: string[] = ['build'],
  agentEnvironmentVariables: string[] = []
): IAutomaticReporterPlan {
  return planAutomaticReporters(resolveReporterSelection({ argv, env, isTTY, agentEnvironmentVariables }));
}

describe('planAutomaticReporters matrix', () => {
  it('selects ai plus file for an agent, with machine stdout and stderr progress', () => {
    const result: IAutomaticReporterPlan = plan({ COPILOT_CLI: '1' }, false);
    expect(result.primary.reporter).toBe('ai');
    expect(result.primary.machine).toBe(true);
    expect(result.stdoutOwner).toBe('machine');
    expect(result.humanProgressDestination).toBe('stderr');
    expect(result.entries.map((e) => e.reporter)).toEqual(['ai', 'file']);
  });

  it('selects detailed plaintext plus file for CI', () => {
    const result: IAutomaticReporterPlan = plan({ CI: 'true' }, false);
    expect(result.primary.reporter).toBe('plaintext');
    expect(result.primary.variant).toBe('detailed');
    expect(result.stdoutOwner).toBe('human');
    expect(result.humanProgressDestination).toBe('stdout');
    expect(result.entries.map((e) => e.reporter)).toEqual(['plaintext', 'file']);
  });

  it('selects default plus file for an interactive TTY', () => {
    const result: IAutomaticReporterPlan = plan({}, true);
    expect(result.primary.reporter).toBe('default');
    expect(result.primary.machine).toBe(false);
    expect(result.entries.map((e) => e.reporter)).toEqual(['default', 'file']);
  });

  it('selects concise plaintext plus file for a generic non-TTY', () => {
    const result: IAutomaticReporterPlan = plan({}, false);
    expect(result.primary.reporter).toBe('plaintext');
    expect(result.primary.variant).toBe('concise');
    expect(result.entries.map((e) => e.reporter)).toEqual(['plaintext', 'file']);
  });

  it('gives an explicitly requested json reporter exclusive machine stdout', () => {
    const result: IAutomaticReporterPlan = plan({}, true, ['build', '--reporter=json']);
    expect(result.primary.reporter).toBe('json');
    expect(result.stdoutOwner).toBe('machine');
    expect(result.humanProgressDestination).toBe('stderr');
  });

  it('always routes emergency diagnostics to stderr', () => {
    expect(plan({ COPILOT_CLI: '1' }, false).emergencyDestination).toBe('stderr');
    expect(plan({}, true).emergencyDestination).toBe('stderr');
  });
});

describe('isMachineReporter', () => {
  it('identifies json and ai as machine reporters', () => {
    expect(isMachineReporter('json')).toBe(true);
    expect(isMachineReporter('ai')).toBe(true);
    expect(isMachineReporter('default')).toBe(false);
    expect(isMachineReporter('plaintext')).toBe(false);
    expect(isMachineReporter('file')).toBe(false);
    expect(isMachineReporter('legacy')).toBe(false);
  });
});

describe('describeReporterPlan', () => {
  it('records the selection reason and reporters for the detailed log', () => {
    const description: string = describeReporterPlan(plan({ CI: 'true' }, false));
    expect(description).toContain('CI detected');
    expect(description).toContain('plaintext[detailed]->stdout');
    expect(description).toContain('file->file');
    expect(description).toContain('stdout owned by human');
  });
});
