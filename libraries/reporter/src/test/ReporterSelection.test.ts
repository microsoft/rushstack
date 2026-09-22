// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  resolveReporterSelection,
  parseOutputControl,
  isAgentVariableActive,
  type IReporterOutputTarget,
  type IReporterSelection
} from '../index';

function selection(
  argv: string[],
  env: Record<string, string | undefined> = {},
  isTTY: boolean = false,
  agentEnvironmentVariables: string[] = []
): IReporterSelection {
  return resolveReporterSelection({ argv, env, isTTY, agentEnvironmentVariables });
}

describe('resolveReporterSelection primary reporter precedence', () => {
  it('honors an explicit --reporter over everything else', () => {
    const result: IReporterSelection = selection(['build', '--reporter=ai'], { CI: 'true' }, true);
    expect(result.primaryReporter).toBe('ai');
    expect(result.reason).toBe('explicit --reporter');
  });

  it('uses RUSH_REPORTER over agent, CI, and TTY', () => {
    const result: IReporterSelection = selection(
      ['build'],
      { RUSH_REPORTER: 'json', COPILOT_CLI: '1' },
      true
    );
    expect(result.primaryReporter).toBe('json');
  });

  it('selects the ai reporter when an agent is detected', () => {
    expect(selection(['build'], { COPILOT_CLI: '1' }).primaryReporter).toBe('ai');
    expect(selection(['build'], { MY_AGENT: 'yes' }, false, ['MY_AGENT']).primaryReporter).toBe('ai');
  });

  it('prefers agent detection over CI', () => {
    const result: IReporterSelection = selection(['build'], { COPILOT_CLI: '1', CI: 'true' });
    expect(result.primaryReporter).toBe('ai');
  });

  it('selects plaintext for CI, default for TTY, and plaintext for generic non-TTY', () => {
    expect(selection(['build'], { CI: 'true' }).primaryReporter).toBe('plaintext');
    expect(selection(['build'], {}, true).primaryReporter).toBe('default');
    expect(selection(['build'], {}, false).primaryReporter).toBe('plaintext');
  });

  it('adds the file reporter except when the primary is already file', () => {
    expect(selection(['build'], {}, true).additionalReporters).toEqual(['file']);
    expect(selection(['build', '--reporter=file']).additionalReporters).toEqual([]);
  });

  it('fails an explicit unsupported reporter request', () => {
    expect(() => selection(['build', '--reporter=bogus'])).toThrow(/Unsupported reporter/);
    expect(() => selection(['build'], { RUSH_REPORTER: 'bogus' })).toThrow(/RUSH_REPORTER/);
  });
});

describe('resolveReporterSelection log level', () => {
  it('resolves explicit --log-level, aliases, and RUSH_LOG_LEVEL, defaulting to normal', () => {
    expect(selection(['build', '--log-level=verbose']).logLevel).toBe('verbose');
    expect(selection(['build', '--quiet']).logLevel).toBe('quiet');
    expect(selection(['build', '--verbose']).logLevel).toBe('verbose');
    expect(selection(['build', '--debug']).logLevel).toBe('debug');
    expect(selection(['build'], { RUSH_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
    expect(selection(['build']).logLevel).toBe('normal');
  });

  it('accepts repeated identical verbosity but rejects contradictions', () => {
    expect(selection(['build', '--verbose', '--verbose']).logLevel).toBe('verbose');
    expect(() => selection(['build', '--quiet', '--verbose'])).toThrow(/Contradictory/);
    expect(() => selection(['build', '--log-level=quiet', '--verbose'])).toThrow(/Contradictory/);
  });

  it('fails an unsupported log level', () => {
    expect(() => selection(['build', '--log-level=loud'])).toThrow(/Unsupported log level/);
  });
});

describe('resolveReporterSelection command json and outputs', () => {
  it('keeps command-specific --json from selecting the json reporter', () => {
    const result: IReporterSelection = selection(['list', '--json'], {}, true);
    expect(result.primaryReporter).toBe('default');
    expect(result.commandJson).toBe(true);
  });

  it('parses --output targets', () => {
    const result: IReporterSelection = selection([
      'build',
      '--output=file://./rush-debug.log?logLevel=debug',
      '--output=json://./events.jsonl'
    ]);
    expect(result.outputs).toEqual<IReporterOutputTarget[]>([
      { reporter: 'file', target: './rush-debug.log', params: { logLevel: 'debug' } },
      { reporter: 'json', target: './events.jsonl', params: {} }
    ]);
  });
});

describe('parseOutputControl', () => {
  it('parses reporter, target, and params', () => {
    expect(parseOutputControl('file://./x.log?a=1&b=2')).toEqual<IReporterOutputTarget>({
      reporter: 'file',
      target: './x.log',
      params: { a: '1', b: '2' }
    });
  });

  it('throws on an invalid output control', () => {
    expect(() => parseOutputControl('not-a-url')).toThrow(/Invalid --output/);
  });
});

describe('isAgentVariableActive', () => {
  it('treats defined non-falsey values as active', () => {
    expect(isAgentVariableActive('1')).toBe(true);
    expect(isAgentVariableActive('true')).toBe(true);
    expect(isAgentVariableActive('copilot')).toBe(true);
  });

  it('treats undefined and falsey values as inactive', () => {
    expect(isAgentVariableActive(undefined)).toBe(false);
    expect(isAgentVariableActive('')).toBe(false);
    expect(isAgentVariableActive('0')).toBe(false);
    expect(isAgentVariableActive('false')).toBe(false);
    expect(isAgentVariableActive('FALSE')).toBe(false);
    expect(isAgentVariableActive('no')).toBe(false);
    expect(isAgentVariableActive('off')).toBe(false);
  });
});
