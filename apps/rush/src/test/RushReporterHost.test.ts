// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventSink } from '@rushstack/rush-reporter';

import {
  initializeRushReporterHostAsync,
  resolveRushReporterSelection,
  stripReporterValueControls,
  type IRushReporterOutputStream,
  type IRushReporterSelection
} from '../RushReporterHost';

function resolve(
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
  isTTY: boolean = false,
  repositoryOptIn: boolean = false,
  forceLegacy: boolean = false
): IRushReporterSelection {
  return resolveRushReporterSelection({
    argv,
    env,
    cwd: '/repo',
    stdout: { isTTY, columns: 100, write: () => undefined },
    repositoryOptIn,
    forceLegacy,
    selectedRushVersion: forceLegacy ? '5.177.0' : undefined
  });
}

function emitCommandStarted(sink: IReporterEventSink): void {
  sink.emit({
    protocolVersion: { major: 1, minor: 0 },
    sessionId: 'session',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
    privacy: 'public',
    type: 'commandStarted',
    payload: { commandName: 'build' }
  });
}

describe(resolveRushReporterSelection.name, () => {
  it('preserves the legacy path without an explicit opt-in in TTY, non-TTY, CI, and agent environments', () => {
    for (const testCase of [
      { env: {}, isTTY: true },
      { env: {}, isTTY: false },
      { env: { CI: 'true' }, isTTY: false },
      { env: { COPILOT_CLI: '1' }, isTTY: true }
    ]) {
      expect(resolve(['build'], testCase.env, testCase.isTTY)).toMatchObject({
        reporter: 'legacy',
        enabled: false,
        reporterControlsOwnedByFrontend: false,
        reporterValueFlagsToStrip: [],
        reason: 'pre-major legacy default'
      });
    }
  });

  it('requires an explicit non-legacy --reporter to opt in', () => {
    expect(resolve(['build', '--reporter=json'], { CI: 'true' }, false)).toMatchObject({
      reporter: 'json',
      enabled: true,
      reason: 'explicit --reporter'
    });
    expect(() => resolve(['build'], { RUSH_REPORTER: 'json' })).toThrow(
      /cannot enable the pre-major reporter path/
    );
  });

  it('uses deterministic non-agent selection for the repository experiment', () => {
    expect(resolve(['build'], {}, true, true)).toMatchObject({
      reporter: 'default',
      enabled: true,
      reason: 'repository experiment'
    });
    expect(resolve(['build'], { CI: 'true' }, true, true)).toMatchObject({
      reporter: 'plaintext',
      enabled: true,
      reason: 'repository experiment'
    });
    expect(resolve(['build'], {}, false, true)).toMatchObject({
      reporter: 'plaintext',
      enabled: true,
      reason: 'repository experiment'
    });
    expect(resolve(['build'], { COPILOT_CLI: '1' }, false, true)).toMatchObject({
      reporter: 'plaintext',
      enabled: true,
      reason: 'repository experiment'
    });
  });

  it('allows reporter controls with the repository experiment', () => {
    expect(
      resolve(
        ['build', '--reporter=plaintext', '--log-level=debug', '--output=json://./events.jsonl'],
        {},
        false,
        true
      )
    ).toMatchObject({
      reporter: 'plaintext',
      logLevel: 'debug',
      outputs: [
        {
          reporter: 'json',
          target: path.resolve('/repo', 'events.jsonl')
        }
      ]
    });
  });

  it('preserves custom value parameters when the repository experiment selects the reporter implicitly', () => {
    expect(
      resolve(
        ['custom', '--output', 'artifact.zip', '--log-level', 'custom-level', '--verbose'],
        {},
        false,
        true
      )
    ).toMatchObject({
      reporter: 'plaintext',
      logLevel: 'verbose',
      outputs: [],
      enabled: true,
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: []
    });
  });

  it('does not consume rush-pnpm or rushx reporter arguments', () => {
    expect(
      resolveRushReporterSelection({
        argv: ['install', '--reporter=append-only'],
        env: { RUSH_REPORTER: 'json' },
        commandName: 'rush-pnpm'
      })
    ).toMatchObject({ reporter: 'legacy', enabled: false });
    expect(
      resolveRushReporterSelection({
        argv: ['build', '--reporter=custom-script-value'],
        env: { RUSH_REPORTER: 'json' },
        commandName: 'rushx'
      })
    ).toMatchObject({ reporter: 'legacy', enabled: false });
  });

  it('keeps RUSH_REPORTER=legacy as an emergency override', () => {
    expect(
      resolve(
        ['build', '--reporter=json', '--quiet', '--debug', '--log-level=invalid'],
        { RUSH_REPORTER: ' LEGACY ' },
        false,
        true
      )
    ).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterValueFlagsToStrip: ['--reporter', '--output', '--log-level'],
      reason: 'RUSH_REPORTER=legacy'
    });

    const legacySelection: IRushReporterSelection = resolve(
      ['custom', '--reporter=legacy', '--output', 'custom.zip', '--log-level', 'custom', '--verbose'],
      { RUSH_REPORTER: 'legacy' }
    );
    expect(legacySelection).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterValueFlagsToStrip: ['--reporter'],
      reason: 'RUSH_REPORTER=legacy'
    });
    expect(
      stripReporterValueControls(
        [
          'node',
          'rush',
          'custom',
          '--reporter=legacy',
          '--output',
          'custom.zip',
          '--log-level',
          'custom',
          '--verbose'
        ],
        new Set(legacySelection.reporterValueFlagsToStrip)
      )
    ).toEqual(['node', 'rush', 'custom', '--output', 'custom.zip', '--log-level', 'custom', '--verbose']);
  });

  it('removes reporter-only value controls before invoking a legacy engine', () => {
    expect(
      stripReporterValueControls([
        'node',
        'rush',
        'list',
        '--json',
        '--reporter=json',
        '--output',
        'file://./rush.log',
        '--log-level=debug',
        '--quiet'
      ])
    ).toEqual(['node', 'rush', 'list', '--json', '--quiet']);
  });

  it('preserves every argument at and after the pass-through separator', () => {
    const passThroughArguments: string[] = [
      '--',
      '--reporter=tool-reporter',
      '--reporter',
      'tool-reporter',
      '--output=tool-output',
      '--output',
      'tool-output',
      '--log-level=tool-level',
      '--log-level',
      'tool-level',
      '--quiet',
      '-q',
      '--verbose',
      '--debug',
      '-d',
      '--json',
      'ordinary',
      'value with spaces'
    ];

    expect(
      stripReporterValueControls([
        'node',
        'rush',
        'build',
        '--reporter=json',
        '--output',
        'json://./events.jsonl',
        '--log-level=debug',
        ...passThroughArguments
      ])
    ).toEqual(['node', 'rush', 'build', ...passThroughArguments]);
    expect(
      stripReporterValueControls(['node', 'rush', 'build', '--reporter', ...passThroughArguments])
    ).toEqual(['node', 'rush', 'build', ...passThroughArguments]);
  });

  it('ignores reporter controls and aliases after the pass-through separator', () => {
    expect(
      resolve([
        'build',
        '--',
        '--reporter=unknown',
        '--output=not-a-url',
        '--log-level=loud',
        '--quiet',
        '-q',
        '--verbose',
        '--debug',
        '-d',
        '--json',
        'ordinary'
      ])
    ).toMatchObject({
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson: false,
      enabled: false,
      reason: 'pre-major legacy default'
    });
  });

  it('applies CLI log-level controls before RUSH_LOG_LEVEL and rejects contradictions', () => {
    expect(
      resolve(['build', '--reporter=plaintext', '--verbose'], { RUSH_LOG_LEVEL: 'quiet' }).logLevel
    ).toBe('verbose');
    expect(resolve(['build', '--reporter=plaintext'], { RUSH_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
    expect(() => resolve(['build', '--reporter=plaintext', '--quiet', '--debug'])).toThrow(
      /Contradictory reporter verbosity/
    );
  });

  it('preserves legacy verbosity combinations when the reporter path is disabled', () => {
    expect(resolve(['build', '--quiet', '--debug'])).toMatchObject({
      reporter: 'legacy',
      logLevel: 'normal',
      enabled: false,
      reporterControlsOwnedByFrontend: false
    });
    expect(resolve(['build', '--reporter=legacy', '--quiet', '--debug'])).toMatchObject({
      reporter: 'legacy',
      logLevel: 'normal',
      enabled: false,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: ['--reporter']
    });
  });

  it('ignores reporter environment selection before the gate and preserves custom value controls', () => {
    expect(resolve(['build'], { RUSH_LOG_LEVEL: 'not-a-level' }).enabled).toBe(false);
    expect(resolve(['custom', '--reporter=junit'])).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: []
    });
    expect(() => resolve(['custom', '--reporter=junit'], {}, false, true)).toThrow(
      /Unsupported reporter "junit"/
    );
    expect(() => resolve(['custom', '--reporter=junit', '--output=json://./events.jsonl'])).toThrow(
      /Unsupported reporter "junit"/
    );
    expect(() => resolve(['build', '--reporter=json', '--log-level=loud'])).toThrow(/Unsupported log level/);
    expect(resolve(['custom', '--output=json://events.jsonl', '--log-level=custom'])).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: false
    });
  });

  it('rejects explicit non-legacy reporters for incompatible selected engines', () => {
    expect(() => resolve(['build', '--reporter=json'], {}, false, true, true)).toThrow(
      /selected Rush engine 5\.177\.0 cannot safely use --reporter=json/
    );
    expect(resolve(['custom', '--reporter=junit', '--verbose'], {}, false, false, true)).toMatchObject({
      reporter: 'legacy',
      logLevel: 'normal',
      enabled: false,
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: [],
      reason: 'pre-major legacy default'
    });
  });

  it('rejects an interactive reporter on non-TTY output', () => {
    expect(() => resolve(['build', '--reporter=default'], {}, false)).toThrow(/requires an interactive TTY/);
    expect(resolve(['build', '--reporter=default'], {}, true).reporter).toBe('default');
  });

  it('parses output targets and preserves command-specific --json independently', () => {
    const selection: IRushReporterSelection = resolve(
      [
        'list',
        '--json',
        '--reporter=json',
        '--output=file://./rush.log?logLevel=debug',
        '--output=json://./events.jsonl'
      ],
      {},
      false
    );

    expect(selection.commandJson).toBe(true);
    expect(selection.reporter).toBe('json');
    expect(selection.outputs).toEqual([
      {
        reporter: 'file',
        target: path.resolve('/repo', 'rush.log'),
        params: { logLevel: 'debug' }
      },
      {
        reporter: 'json',
        target: path.resolve('/repo', 'events.jsonl'),
        params: {}
      }
    ]);
  });

  it('surfaces unsupported and incomplete controls with actionable errors', () => {
    expect(() => resolve(['build', '--reporter'])).toThrow(/--reporter requires a value/);
    expect(() => resolve(['build', '--reporter=json', '--reporter=ai'])).toThrow(
      /may be specified only once/
    );
    expect(() => resolve(['build', '--reporter=json', '--output=plaintext://./output.txt'])).toThrow(
      /supports file:\/\/ and json:\/\//
    );
    expect(() => resolve(['build', '--reporter=json', '--output=file://./output.txt?unknown=value'])).toThrow(
      /only supported query parameter is logLevel/
    );
  });
});

describe(initializeRushReporterHostAsync.name, () => {
  it('hands callers a typed sink while leaving no-opt-in output unchanged', async () => {
    let output: string = '';
    const stdout: IRushReporterOutputStream = {
      isTTY: false,
      write: (text: string) => {
        output += text;
      }
    };
    const initialized = await initializeRushReporterHostAsync({
      argv: ['build'],
      env: { CI: 'true', COPILOT_CLI: '1' },
      stdout,
      includeDefaultFileReporter: false
    });

    const sink: IReporterEventSink = initialized.sink;
    emitCommandStarted(sink);
    await initialized.closeAsync();

    expect(initialized.selection.enabled).toBe(false);
    expect(output).toBe('');
  });

  it('initializes the explicitly selected reporter and output destinations', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const outputPath: string = path.join(directory, 'events.jsonl');
    let stdoutText: string = '';
    try {
      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=json', `--output=json://${outputPath}`],
        env: {},
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        },
        includeDefaultFileReporter: false
      });

      emitCommandStarted(initialized.sink);
      const firstClose: Promise<void> = initialized.closeAsync();
      expect(initialized.closeAsync()).toBe(firstClose);
      await firstClose;

      expect(JSON.parse(stdoutText).type).toBe('commandStarted');
      expect(JSON.parse(await fs.promises.readFile(outputPath, 'utf8')).type).toBe('commandStarted');
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
