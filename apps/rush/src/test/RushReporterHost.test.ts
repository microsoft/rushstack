// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ReporterManager,
  OldEngineOutputAdapter,
  type IReporter,
  type IReporterContext,
  type IReporterEventEnvelope,
  type IReporterEventSink,
  BootstrapEventBuffer,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR,
  writeBootstrapHandoffFileAsync
} from '@rushstack/rush-reporter';

import {
  initializeRushReporterHostAsync,
  resolveRushReporterSelection,
  stripReporterValueControls,
  type IInitializedRushReporterHost,
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

function emitOperationEvents(sink: IReporterEventSink): void {
  const base = {
    protocolVersion: { major: 1, minor: 1 },
    sessionId: 'session',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
    scope: { commandName: 'build', operationId: 'project#phase' }
  } as const;
  sink.emit({
    ...base,
    privacy: 'public',
    type: 'operationRegistered',
    payload: { operationId: 'project#phase', projectName: 'project', phaseName: 'phase' }
  });
  sink.emit({
    ...base,
    privacy: 'public',
    type: 'operationStatusChanged',
    payload: { operationId: 'project#phase', previousStatus: 'queued', status: 'executing' }
  });
  sink.emit({
    ...base,
    privacy: 'local-sensitive',
    type: 'externalOutput',
    payload: { stream: 'stdout', text: 'raw operation output\n' }
  });
  sink.emit({
    ...base,
    privacy: 'public',
    type: 'operationStreamClosed',
    payload: { operationId: 'project#phase' }
  });
  sink.emit({
    ...base,
    privacy: 'public',
    type: 'operationCompleted',
    payload: { operationId: 'project#phase', status: 'success' }
  });
}

describe(resolveRushReporterSelection.name, () => {
  it.each(['--reporter', '--output', '--log-level'])(
    'does not consume legacy flags after a value-less %s during rollback',
    (flag) => {
      const argv: string[] = ['build', '--reporter=json', flag, '--quiet', '--debug'];
      const selection: IRushReporterSelection = resolve(argv, { RUSH_REPORTER: 'legacy' });
      expect(stripReporterValueControls(argv, new Set(selection.reporterValueFlagsToStrip))).toEqual([
        'build',
        '--quiet',
        '--debug'
      ]);
    }
  );

  it('defaults only an unqualified primary file reporter to debug', () => {
    expect(resolve(['build', '--reporter=file']).logLevel).toBe('debug');
    expect(resolve(['build', '--reporter=plaintext']).logLevel).toBe('normal');
    for (const level of ['quiet', 'normal', 'verbose', 'debug']) {
      expect(resolve(['build', '--reporter=file', `--log-level=${level}`]).logLevel).toBe(level);
      expect(resolve(['build', '--reporter=file'], { RUSH_LOG_LEVEL: level }).logLevel).toBe(level);
    }
    expect(resolve(['build', '--reporter=file', '--quiet'], { RUSH_LOG_LEVEL: 'debug' }).logLevel).toBe(
      'quiet'
    );
    expect(resolve(['build', '--reporter=file', '--verbose'], { RUSH_LOG_LEVEL: 'quiet' }).logLevel).toBe(
      'verbose'
    );
    expect(resolve(['build', '--reporter=file', '--debug'], { RUSH_LOG_LEVEL: 'normal' }).logLevel).toBe(
      'debug'
    );
    expect(resolve(['build', '--reporter=file'], { RUSH_REPORTER: 'legacy' }).enabled).toBe(false);
  });

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
    expect(resolve(['build', '--quiet', '--verbose', '--debug'], {}, false, true).logLevel).toBe('debug');
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

  it('owns standalone log-level controls when the repository experiment is enabled', () => {
    expect(resolve(['build', '--log-level=debug'], {}, false, true)).toMatchObject({
      reporter: 'plaintext',
      logLevel: 'debug',
      enabled: true,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: ['--log-level']
    });
    expect(resolve(['build'], { RUSH_LOG_LEVEL: 'debug' }, false, true)).toMatchObject({
      reporter: 'plaintext',
      logLevel: 'debug',
      enabled: true,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: []
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

  it('keeps help on the legacy parser-only path', () => {
    expect(resolve(['build', '--help', '--reporter=json'], {}, false)).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: true
    });
  });

  it.each([
    ['build', '--reporter=json', '--output=file://./help.log', '--log-level=debug', '--help'],
    ['build', '--help', '--reporter=default', '--output', 'json://./events.jsonl', '--log-level', 'quiet']
  ])('strips explicit reporter-owned value controls for help: %s', (...argv: string[]) => {
    const selection: IRushReporterSelection = resolve(argv);
    expect(selection).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: true
    });
    expect(stripReporterValueControls(argv, new Set(selection.reporterValueFlagsToStrip))).toEqual([
      'build',
      '--help'
    ]);
  });

  it.each([
    [
      ['build', '--output=json://./events.jsonl', '--log-level=debug', '--help'],
      ['build', '--help']
    ],
    [
      ['build', '--log-level=debug', '--help'],
      ['build', '--help']
    ],
    [
      ['custom', '--output', 'artifact.zip', '--log-level', 'custom-level', '--help'],
      ['custom', '--output', 'artifact.zip', '--log-level', 'custom-level', '--help']
    ],
    [
      ['custom', '--output', 'artifact.zip', '--log-level', 'debug', '--help'],
      ['custom', '--output', 'artifact.zip', '--log-level', 'debug', '--help']
    ],
    [
      ['custom', '--output', '--log-level=debug', '--help'],
      ['custom', '--output', '--log-level=debug', '--help']
    ],
    [
      ['custom', '--output=file://./log', '--log-level=custom', '--help'],
      ['custom', '--output=file://./log', '--log-level=custom', '--help']
    ],
    [
      ['custom', '--output=file://./log', '--output=custom.zip', '--log-level=debug', '--help'],
      ['custom', '--output=file://./log', '--output=custom.zip', '--log-level=debug', '--help']
    ],
    [
      ['custom', '--log-level', '--help'],
      ['custom', '--log-level', '--help']
    ],
    [
      ['plugin-command', '--output=json://./custom.jsonl', '--log-level=debug', '--verbose', '--help'],
      ['plugin-command', '--output=json://./custom.jsonl', '--log-level=debug', '--verbose', '--help']
    ],
    [
      ['build', '--log-level=debug', '--help', '--', '--output=json://./child'],
      ['build', '--help', '--', '--output=json://./child']
    ]
  ])('uses selective implicit ownership for repository help: %j', (argv, expected) => {
    const selection: IRushReporterSelection = resolve(argv, {}, false, true);
    expect(selection.enabled).toBe(false);
    expect(stripReporterValueControls(argv, new Set(selection.reporterValueFlagsToStrip))).toEqual(expected);
  });

  it('owns RUSH_LOG_LEVEL for repository help without enabling reporters', () => {
    expect(resolve(['build', '--help'], { RUSH_LOG_LEVEL: 'debug' }, false, true)).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: []
    });
    expect(resolve(['custom', '--help'], { RUSH_LOG_LEVEL: 'debug' })).toMatchObject({
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: []
    });
  });

  it('does not use implicit reporter value controls to opt in on help', () => {
    const argv: string[] = ['custom', '--output=file://./log', '--log-level=debug', '--help'];
    const selection: IRushReporterSelection = resolve(argv);
    expect(selection.reporterControlsOwnedByFrontend).toBe(false);
    expect(stripReporterValueControls(argv, new Set(selection.reporterValueFlagsToStrip))).toEqual(argv);
  });

  it('preserves command-owned help values under explicit and emergency legacy', () => {
    const argv: string[] = [
      'custom',
      '--reporter=legacy',
      '--output',
      'artifact.zip',
      '--log-level',
      'custom',
      '--help'
    ];
    for (const env of [{}, { RUSH_REPORTER: 'legacy', RUSH_LOG_LEVEL: 'invalid' }]) {
      const selection: IRushReporterSelection = resolve(argv, env, false, true);
      expect(stripReporterValueControls(argv, new Set(selection.reporterValueFlagsToStrip))).toEqual([
        'custom',
        '--output',
        'artifact.zip',
        '--log-level',
        'custom',
        '--help'
      ]);
    }
  });

  it('does not consume following flags while stripping incomplete owned controls for help', () => {
    expect(stripReporterValueControls(['build', '--reporter=json', '--output', '--help'])).toEqual([
      'build',
      '--help'
    ]);
    expect(
      stripReporterValueControls([
        'build',
        '--reporter=json',
        '--log-level',
        '--help',
        '--',
        '--output=child'
      ])
    ).toEqual(['build', '--help', '--', '--output=child']);
  });

  it('ignores help controls after the pass-through separator', () => {
    expect(resolve(['build', '--reporter=json', '--', '--help'])).toMatchObject({
      reporter: 'json',
      enabled: true,
      reporterControlsOwnedByFrontend: true
    });
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
    expect(
      resolve(['build', '--reporter=json', '--', '--reporter=unknown', '--log-level=invalid'])
    ).toMatchObject({ reporter: 'json', enabled: true });
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

  it('preserves RUSH_QUIET_MODE as a quiet reporter alias', () => {
    expect(resolve(['build', '--reporter=plaintext'], { RUSH_QUIET_MODE: 'true' }).logLevel).toBe('quiet');
    expect(() =>
      resolve(['build', '--reporter=plaintext'], { RUSH_QUIET_MODE: '1', RUSH_LOG_LEVEL: 'debug' })
    ).toThrow(/contradicts RUSH_LOG_LEVEL/);
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

  it('probes value-less custom reporter flags without claiming ownership', () => {
    expect(resolve(['custom', '--reporter'])).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: false
    });
    expect(resolve(['custom', '--reporter', '--verbose'])).toMatchObject({
      reporter: 'legacy',
      enabled: false,
      reporterControlsOwnedByFrontend: false
    });
    expect(() => resolve(['custom', '--reporter'], {}, false, true)).toThrow(/--reporter requires a value/);
    expect(() => resolve(['custom', '--reporter', '--output=json://./events.jsonl'])).toThrow(
      /--reporter requires a value/
    );
    expect(() => resolve(['custom', '--reporter=json', '--reporter'])).toThrow(/--reporter requires a value/);
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

  it('preserves command-specific --json as the sole stdout owner', () => {
    expect(() => resolve(['list', '--json', '--reporter=json'])).toThrow(
      /command-specific --json output owns stdout/
    );

    const selection: IRushReporterSelection = resolve(
      ['list', '--json', '--output=file://./rush.log?logLevel=debug', '--output=json://./events.jsonl'],
      {},
      false,
      true
    );

    expect(selection).toMatchObject({
      commandJson: true,
      reporter: 'file',
      enabled: true,
      reason: 'repository experiment'
    });
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
    expect(selection).toMatchObject({
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: ['--output']
    });
    expect(resolve(['list', '--json', '--reporter=file']).reporter).toBe('file');
  });

  it('forces legacy selection for an incompatible Rush engine', () => {
    expect(() =>
      resolveRushReporterSelection({
        argv: ['build', '--reporter=json'],
        env: {},
        forceLegacy: true
      })
    ).toThrow(/cannot safely use --reporter=json/);
  });

  it('surfaces unsupported and incomplete controls with actionable errors', () => {
    expect(() => resolve(['build', '--reporter=json', '--reporter=ai'])).toThrow(
      /may be specified only once/
    );
    expect(() => resolve(['build', '--reporter=json', '--log-level=quiet', '--debug'])).toThrow(
      /Contradictory reporter verbosity/
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
  it.each([false, true])(
    'preserves selected file levels without filtering the full-detail artifact (explicit normal: %s)',
    async (normal) => {
      const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-file-level-'));
      const osModule: typeof os = jest.requireActual('node:os');
      const tmpdirSpy: jest.SpyInstance = jest.spyOn(osModule, 'tmpdir').mockReturnValue(directory);
      try {
        const initialized = await initializeRushReporterHostAsync({
          argv: ['build', '--reporter=file', ...(normal ? ['--log-level=normal'] : [])],
          env: {},
          stdout: { write: () => undefined },
          includeDefaultFileReporter: false
        });
        expect(initialized.selection.logLevel).toBe(normal ? 'normal' : 'debug');
        initialized.sink.emit({
          protocolVersion: { major: 1, minor: 0 },
          sessionId: 'primary-file-level',
          source: { packageName: '@microsoft/rush-lib', packageVersion: '5.179.0' },
          privacy: 'public',
          type: 'messageEmitted',
          payload: { severity: 'debug', text: 'retained-debug-detail' }
        });
        await initialized.closeAsync();

        const [logFolder]: string[] = await fs.promises.readdir(directory);
        const names: string[] = await fs.promises.readdir(path.join(directory, logFolder));
        const logName: string | undefined = names.find(
          (name) => name.endsWith('.log') && name !== 'latest.log'
        );
        expect(logName).toBeDefined();
        const text: string = await fs.promises.readFile(path.join(directory, logFolder, logName!), 'utf8');
        // This combined slice exposes the unfiltered invocation artifact rather than an R2-only primary file.
        expect(text).toContain('retained-debug-detail');
      } finally {
        tmpdirSpy.mockRestore();
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each(['json', 'plaintext'])(
    'preserves unscoped and command-scoped output alongside collated operations: %s',
    async (reporter) => {
      let output: string = '';
      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', `--reporter=${reporter}`, '--log-level=debug'],
        env: { CI: 'true' },
        stdout: { isTTY: false, write: (text: string) => (output += text) },
        includeDefaultFileReporter: false
      });
      const adapter: OldEngineOutputAdapter = new OldEngineOutputAdapter({
        sink: initialized.sink,
        sessionId: 'session',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' }
      });
      try {
        emitCommandStarted(initialized.sink);
        adapter.capture('stdout', 'bootstrap stdout\n', false);
        emitOperationEvents(initialized.sink);
        adapter.capture('stderr', 'bootstrap stderr\n', false);
        initialized.sink.emit({
          protocolVersion: { major: 1, minor: 1 },
          sessionId: 'session',
          source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
          scope: { commandName: 'build' },
          privacy: 'local-sensitive',
          type: 'externalOutput',
          payload: { stream: 'stdout', text: 'command output\n' }
        });
        await initialized.closeAsync();

        if (reporter === 'json') {
          const events: IReporterEventEnvelope<{ stream?: string; text?: string }>[] = output
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
          expect(events.map((event) => event.type)).toEqual([
            'commandStarted',
            'externalOutput',
            'operationRegistered',
            'operationStatusChanged',
            'externalOutput',
            'operationStreamClosed',
            'operationCompleted',
            'externalOutput',
            'externalOutput'
          ]);
          expect(
            events.filter((event) => event.type === 'externalOutput').map((event) => event.payload)
          ).toEqual([
            { stream: 'stdout', text: 'bootstrap stdout\n' },
            { stream: 'stdout', text: 'raw operation output\n' },
            { stream: 'stderr', text: 'bootstrap stderr\n' },
            { stream: 'stdout', text: 'command output\n' }
          ]);
        } else {
          for (const text of [
            'bootstrap stdout\n',
            'raw operation output\n',
            'bootstrap stderr\n',
            'command output\n'
          ]) {
            expect(output.split(text)).toHaveLength(2);
          }
          expect(output.indexOf('bootstrap stdout\n')).toBeLessThan(output.indexOf('bootstrap stderr\n'));
          expect(output.indexOf('bootstrap stderr\n')).toBeLessThan(output.indexOf('command output\n'));
        }
      } finally {
        await initialized.closeAsync();
      }
    }
  );

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
    expect(initialized.logArtifact).toBeUndefined();
    expect(output).toBe('');
  });

  it('always creates a repository full-detail log on the enabled path', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-full-log-'));
    try {
      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=plaintext'],
        env: {},
        commonTempFolder: directory,
        actionName: 'build',
        stdout: { isTTY: false, write: () => undefined }
      });

      expect(initialized.logArtifact).toMatchObject({ available: true });
      expect(initialized.logArtifact?.path).toMatch(
        new RegExp(`^${directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
      await initialized.closeAsync();
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('prints the file path for a parser-only failure without commandResult', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-file-only-'));
    let stderrText: string = '';
    try {
      const initialized = await initializeRushReporterHostAsync({
        argv: ['missing-command', '--reporter=file'],
        env: {},
        commonTempFolder: directory,
        actionName: 'missing-command',
        stdout: { isTTY: false, write: () => undefined },
        stderr: {
          write: (text: string) => {
            stderrText += text;
          }
        }
      });
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush', packageVersion: '5.178.1' },
        privacy: 'local-sensitive',
        type: 'artifactAvailable',
        payload: {
          role: 'log',
          path: initialized.logArtifact?.path,
          format: 'plaintext',
          complete: false
        }
      });
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
        privacy: 'public',
        type: 'sessionCompleted',
        payload: { exitCode: 1 }
      });
      await initialized.closeAsync();

      expect(stderrText.match(/Rush full log:/g)).toHaveLength(1);
      expect(stderrText).toContain(initialized.logArtifact?.path);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('does not render operation output at quiet plaintext log level', async () => {
    let output: string = '';
    const quietHost = await initializeRushReporterHostAsync({
      argv: ['build', '--reporter=plaintext', '--log-level=quiet'],
      env: {},
      stdout: {
        isTTY: false,
        write: (text: string) => {
          output += text;
        }
      },
      includeDefaultFileReporter: false
    });

    emitCommandStarted(quietHost.sink);
    emitOperationEvents(quietHost.sink);
    quietHost.sink.emit({
      protocolVersion: { major: 1, minor: 1 },
      sessionId: 'session',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
      privacy: 'public',
      type: 'commandResult',
      payload: { commandName: 'build', succeeded: true, exitCode: 0 }
    });
    await quietHost.closeAsync();

    expect(output).not.toContain('raw operation output');
    expect(output).toContain('rush build succeeded');
  });

  it('initializes the explicitly selected reporter and output destinations', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const outputPath: string = path.join(directory, 'events.jsonl');
    let stdoutText: string = '';
    try {
      const initialized = await initializeRushReporterHostAsync({
        argv: [
          'build',
          '--reporter=json',
          '--log-level=debug',
          `--output=json://${outputPath}?logLevel=debug`
        ],
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
      emitOperationEvents(initialized.sink);
      const firstClose: Promise<void> = initialized.closeAsync();
      expect(initialized.closeAsync()).toBe(firstClose);
      await firstClose;

      const stdoutEvents: Record<string, unknown>[] = stdoutText
        .trim()
        .split('\n')
        .map((line: string) => JSON.parse(line) as Record<string, unknown>);
      const fileEvents: Record<string, unknown>[] = (await fs.promises.readFile(outputPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line: string) => JSON.parse(line) as Record<string, unknown>);
      expect(stdoutEvents.map(({ type }) => type)).toEqual([
        'commandStarted',
        'operationRegistered',
        'operationStatusChanged',
        'externalOutput',
        'operationStreamClosed',
        'operationCompleted'
      ]);
      expect(fileEvents.map(({ type }) => type)).toEqual([
        'commandStarted',
        'operationRegistered',
        'operationStatusChanged',
        'externalOutput',
        'operationStreamClosed',
        'operationCompleted'
      ]);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('publishes a completed artifact before the final AI record', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-ai-artifact-'));
    let stdoutText: string = '';
    try {
      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=ai'],
        env: {},
        commonTempFolder: directory,
        actionName: 'build',
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        }
      });

      emitCommandStarted(initialized.sink);
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush', packageVersion: '5.178.1' },
        privacy: 'local-sensitive',
        type: 'artifactAvailable',
        payload: {
          role: 'log',
          path: initialized.logArtifact?.path,
          format: 'plaintext',
          complete: false
        }
      });
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
        privacy: 'public',
        type: 'commandResult',
        payload: { commandName: 'build', succeeded: true, exitCode: 0 }
      });
      await initialized.closeAsync();

      const finalRecord: { log?: { complete?: boolean; path?: string } } = JSON.parse(
        stdoutText.trim().split('\n').at(-1)!
      );
      expect(finalRecord.log).toMatchObject({
        complete: true,
        path: initialized.logArtifact?.path
      });
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('observes terminal resizing after binding the default stdout writer', async () => {
    const originalColumns: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns'
    );
    const originalIsTTY: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
      process.stdout,
      'isTTY'
    );
    let output: string = '';
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output += chunk.toString();
      return true;
    });
    let initialized: IInitializedRushReporterHost | undefined;
    try {
      Object.defineProperty(process.stdout, 'columns', { configurable: true, writable: true, value: 80 });
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
      initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=default'],
        env: { NO_COLOR: '' },
        includeDefaultFileReporter: false
      });
      const activity: string = 'a'.repeat(60);
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 0 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
        privacy: 'public',
        type: 'activityChanged',
        payload: { text: activity }
      });
      await initialized.host.manager.flushAsync();
      expect(output).toContain(activity);

      output = '';
      process.stdout.columns = 20;
      await initialized.host.manager.flushAsync();
      expect(output).not.toContain(activity);
      expect(output).toContain('a'.repeat(19));
    } finally {
      await initialized?.closeAsync();
      writeSpy.mockRestore();
      for (const [property, descriptor] of [
        ['columns', originalColumns],
        ['isTTY', originalIsTTY]
      ] as const) {
        if (descriptor) {
          Object.defineProperty(process.stdout, property, descriptor);
        } else {
          Reflect.deleteProperty(process.stdout, property);
        }
      }
    }
  });

  it('publishes a frozen complete artifact after archiving replayed bootstrap output', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-artifact-snapshot-'));
    const reported: IReporterEventEnvelope<unknown>[] = [];
    const manager: ReporterManager = new ReporterManager();
    const captureReporter: IReporter = {
      name: 'capture',
      initializeAsync: async (context: IReporterContext) => {
        void context;
      },
      report: (event: IReporterEventEnvelope<unknown>) => {
        reported.push(event);
      },
      flushAsync: async () => undefined,
      closeAsync: async () => undefined
    };
    manager.addReporter(captureReporter);
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.emit({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        payload: { stream: 'stdout', text: 'bootstrap output\n', wasRendered: true }
      });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=json'],
        env: {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        },
        handoffDirectory: directory,
        commonTempFolder: directory,
        actionName: 'build',
        stdout: { isTTY: false, write: () => undefined },
        manager
      });
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush', packageVersion: '5.178.1' },
        privacy: 'local-sensitive',
        type: 'artifactAvailable',
        payload: {
          role: 'log',
          path: initialized.logArtifact?.path,
          format: 'plaintext',
          complete: false
        }
      });
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.178.1' },
        privacy: 'public',
        type: 'commandResult',
        payload: { commandName: 'build', succeeded: true, exitCode: 0 }
      });
      await initialized.closeAsync();

      expect(initialized.bootstrapReplay).toMatchObject({ replayed: true, eventCount: 1 });
      expect(fs.existsSync(handoffPath)).toBe(false);
      expect(await fs.promises.readFile(initialized.logArtifact!.path!, 'utf8')).toContain(
        'bootstrap output\n'
      );
      const finalArtifact: IReporterEventEnvelope<unknown> = reported
        .filter(({ type }) => type === 'artifactAvailable')
        .at(-1)!;
      const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
        finalArtifact.payload as object,
        'complete'
      );
      expect(descriptor).toMatchObject({ value: true, writable: false });
      expect(typeof (finalArtifact.payload as { complete: unknown }).complete).toBe('boolean');
      expect(finalArtifact.source).toEqual({
        packageName: '@microsoft/rush',
        packageVersion: '5.178.1'
      });
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('replays and deletes a bootstrap handoff before returning the authoritative host', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    let stdoutText: string = '';
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.emit({ type: 'sessionStarted', payload: { rushVersion: '5.178.1' } });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=json'],
        env,
        handoffDirectory: directory,
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        },
        includeDefaultFileReporter: false
      });
      await initialized.host.manager.flushAsync();

      expect(initialized.bootstrapReplay).toMatchObject({ replayed: true, eventCount: 1 });
      expect(fs.existsSync(handoffPath)).toBe(false);
      expect(env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]).toBeUndefined();
      expect(env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]).toBeUndefined();
      expect(JSON.parse(stdoutText).type).toBe('sessionStarted');
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('does not replay live bootstrap output to the same visible destination', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    const outputPath: string = path.join(directory, 'events.jsonl');
    let stdoutText: string = '';
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.emit({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        payload: { stream: 'stdout', text: 'npm output\n', wasRendered: true }
      });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      const initialized = await initializeRushReporterHostAsync({
        argv: [
          'build',
          '--reporter=plaintext',
          '--log-level=debug',
          `--output=json://${outputPath}?logLevel=debug`
        ],
        env,
        handoffDirectory: directory,
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        },
        includeDefaultFileReporter: false
      });
      initialized.sink.emit({
        protocolVersion: { major: 1, minor: 0 },
        sessionId: 'old-engine-session',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.0' },
        privacy: 'local-sensitive',
        type: 'externalOutput',
        payload: { stream: 'stderr', text: 'old engine output\n', wasRendered: true }
      });
      await initialized.host.manager.closeAsync();

      expect(stdoutText).toBe('');
      expect(
        (await fs.promises.readFile(outputPath, 'utf8'))
          .trim()
          .split('\n')
          .map((line: string) => JSON.parse(line))
      ).toEqual([
        expect.objectContaining({
          type: 'externalOutput',
          payload: { stream: 'stdout', text: 'npm output\n', wasRendered: true }
        }),
        expect.objectContaining({
          type: 'externalOutput',
          payload: { stream: 'stderr', text: 'old engine output\n', wasRendered: true }
        })
      ]);
      expect(fs.existsSync(handoffPath)).toBe(false);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('retains bootstrap stdout and stderr records in the primary JSON stream', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    let stdoutText: string = '';
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.emit({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        payload: { stream: 'stdout', text: 'captured stdout\n' }
      });
      buffer.emit({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        payload: { stream: 'stderr', text: 'live stderr\n', wasRendered: true }
      });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=json', '--log-level=debug'],
        env,
        handoffDirectory: directory,
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        },
        includeDefaultFileReporter: false
      });
      await initialized.closeAsync();

      expect(
        stdoutText
          .trim()
          .split('\n')
          .map((line: string) => JSON.parse(line).payload)
      ).toEqual([
        { stream: 'stdout', text: 'captured stdout\n' },
        { stream: 'stderr', text: 'live stderr\n', wasRendered: true }
      ]);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('restores ordered legacy output when repository opt-in meets an incompatible handoff', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    const argv: string[] = ['list', '--verbose', '--log-level=verbose'];
    let stdoutText: string = '';
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.emit({ type: 'activityChanged', payload: { text: 'installing Rush' } });
      buffer.addExternalOutput('stdout', 'npm output\n');
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const contents: string = await fs.promises.readFile(handoffPath, 'utf8');
      await fs.promises.writeFile(handoffPath, contents.replace(/"major":1/g, '"major":2'));
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      const initialized = await initializeRushReporterHostAsync({
        argv,
        env,
        repositoryOptIn: true,
        handoffDirectory: directory,
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        },
        includeDefaultFileReporter: false
      });
      await initialized.closeAsync();

      expect(initialized.bootstrapReplay.skipReason).toBe('incompatible-protocol');
      expect(initialized.selection).toMatchObject({
        enabled: false,
        reason: 'bootstrap compatibility fallback',
        reporterValueFlagsToStrip: ['--log-level'],
        reporterFlagsToStrip: ['--verbose']
      });
      expect(
        stripReporterValueControls(
          argv,
          new Set(initialized.selection.reporterValueFlagsToStrip),
          new Set(initialized.selection.reporterFlagsToStrip)
        )
      ).toEqual(['list']);
      expect(stdoutText).toBe('installing Rush\nnpm output\n');
      expect(fs.existsSync(handoffPath)).toBe(false);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('falls back when repository opt-in meets an unsupported required bootstrap event', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    const argv: string[] = ['list', '--verbose', '--log-level=verbose'];
    let stdoutText: string = '';
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.addExternalOutput('stdout', 'npm output\n');
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const lines: string[] = (await fs.promises.readFile(handoffPath, 'utf8')).trimEnd().split('\n');
      const requiredEvent: Record<string, unknown> = {
        ...(JSON.parse(lines[1]) as Record<string, unknown>),
        eventId: 'future-required',
        type: 'futureRequiredEvent',
        required: true,
        protocolVersion: { major: 1, minor: 1 }
      };
      lines.push(JSON.stringify(requiredEvent));
      await fs.promises.writeFile(handoffPath, `${lines.join('\n')}\n`);
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      const initialized = await initializeRushReporterHostAsync({
        argv,
        env,
        repositoryOptIn: true,
        handoffDirectory: directory,
        stdout: {
          isTTY: false,
          write: (text: string) => {
            stdoutText += text;
          }
        },
        includeDefaultFileReporter: false
      });
      await initialized.closeAsync();

      expect(initialized.bootstrapReplay.skipReason).toBe('unsupported-required-event');
      expect(initialized.selection).toMatchObject({
        enabled: false,
        reason: 'bootstrap compatibility fallback',
        reporterValueFlagsToStrip: ['--log-level'],
        reporterFlagsToStrip: ['--verbose']
      });
      expect(
        stripReporterValueControls(
          argv,
          new Set(initialized.selection.reporterValueFlagsToStrip),
          new Set(initialized.selection.reporterFlagsToStrip)
        )
      ).toEqual(['list']);
      expect(stdoutText).toBe('npm output\n');
      expect(fs.existsSync(handoffPath)).toBe(false);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('fails an explicit reporter request for an unsupported required bootstrap event', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    let stderrText: string = '';
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.addExternalOutput('stdout', 'npm output\n');
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      const lines: string[] = (await fs.promises.readFile(handoffPath, 'utf8')).trimEnd().split('\n');
      const requiredEvent: Record<string, unknown> = {
        ...(JSON.parse(lines[1]) as Record<string, unknown>),
        eventId: 'future-required',
        type: 'futureRequiredEvent',
        required: true,
        protocolVersion: { major: 1, minor: 1 }
      };
      lines.push(JSON.stringify(requiredEvent));
      await fs.promises.writeFile(handoffPath, `${lines.join('\n')}\n`);
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      await expect(
        initializeRushReporterHostAsync({
          argv: ['build', '--reporter=json'],
          env,
          handoffDirectory: directory,
          stdout: { isTTY: false, write: () => undefined },
          stderr: {
            write: (text: string) => {
              stderrText += text;
            }
          },
          includeDefaultFileReporter: false
        })
      ).rejects.toThrow(/unsupported required event/);

      expect(stderrText).toBe('npm output\n');
      expect(fs.existsSync(handoffPath)).toBe(false);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('deletes an authenticated handoff when explicit reporter validation fails', async () => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-frontend-'));
    const env: Record<string, string | undefined> = {};
    try {
      const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
        sessionId: 'bootstrap-session',
        source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
      });
      buffer.emit({ type: 'sessionStarted', payload: {} });
      const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
      env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
      env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;

      await expect(
        initializeRushReporterHostAsync({
          argv: ['build', '--reporter=default'],
          env,
          handoffDirectory: directory,
          stdout: { isTTY: false, write: () => undefined },
          includeDefaultFileReporter: false
        })
      ).rejects.toThrow(/requires an interactive TTY/);

      expect(fs.existsSync(handoffPath)).toBe(false);
      expect(env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]).toBeUndefined();
      expect(env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]).toBeUndefined();
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
