// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as rushLib from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';

import { launchRushFrontendAsync } from '../RushFrontend';
import {
  initializeRushReporterHostAsync,
  resolveRushReporterSelection,
  stripReporterValueControls,
  type IRushReporterSelection
} from '../RushReporterHost';
import type { MinimalRushConfiguration } from '../MinimalRushConfiguration';

describe('reporter command-line ownership', () => {
  let folder: string;
  let originalArgv: string[];
  let originalExitCode: typeof process.exitCode;
  let locks: jest.SpiedFunction<typeof LockFile.tryAcquire>;

  beforeEach(async () => {
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-reporter-ownership-'));
    await fs.promises.cp(
      path.resolve(__dirname, '../../../../libraries/rush-lib/src/cli/test/basicAndRunBuildActionRepo'),
      folder,
      { recursive: true }
    );
    originalArgv = process.argv;
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    EnvironmentConfiguration.reset();
    locks = jest.spyOn(LockFile, 'tryAcquire');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    for (const result of locks.mock.results) {
      if (result.type === 'return' && result.value && !result.value.isReleased) {
        result.value.release();
      }
    }
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    EnvironmentConfiguration.reset();
    jest.restoreAllMocks();
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  function select(argv: readonly string[], repositoryOptIn: boolean): IRushReporterSelection {
    return resolveRushReporterSelection({
      argv,
      env: {},
      cwd: folder,
      commandName: 'rush',
      repositoryOptIn,
      stdout: { isTTY: false, write: () => undefined }
    });
  }

  async function executeAsync(
    argv: readonly string[],
    repositoryOptIn: boolean
  ): Promise<{ selection: IRushReporterSelection; succeeded: boolean; forwarded: readonly string[] }> {
    process.argv = ['node', 'rush', ...argv];
    let selection: IRushReporterSelection | undefined;
    let succeeded: boolean | undefined;
    let forwarded: readonly string[] = [];
    await launchRushFrontendAsync({
      currentPackageVersion: rushLib.Rush.version,
      rushVersionToLoad: undefined,
      configuration: { useRushReporter: repositoryOptIn } as MinimalRushConfiguration,
      launchOptions: { isManaged: false },
      currentRushLib: rushLib,
      initializeReporterHostAsync: async (options) => {
        const initialized = await initializeRushReporterHostAsync({
          ...options,
          argv: process.argv.slice(2),
          env: {},
          cwd: folder,
          commandName: 'rush',
          stdout: { isTTY: false, write: () => undefined },
          includeDefaultFileReporter: false
        });
        selection = initialized.selection;
        return initialized;
      },
      executeCurrentRush: (version, selectedRushLib, options) => {
        void version;
        void selectedRushLib;
        forwarded = process.argv.slice(2);
        const parser: RushCommandLineParser = new RushCommandLineParser({
          cwd: folder,
          reporterCloseAsync: options.reporterCloseAsync
        });
        return parser.executeAsync().then((result) => {
          succeeded = result;
        });
      }
    });
    if (!selection || succeeded === undefined) {
      throw new Error('Expected the real frontend and parser to execute.');
    }
    return { selection, succeeded, forwarded };
  }

  it.each([false, true])(
    'preserves the standalone reporter strip list through real native help (repository opt-in: %s)',
    async (implicit) => {
      jest.spyOn(process.stdout, 'write').mockReturnValue(true);
      const result = await executeAsync(
        ['list', ...(implicit ? [] : ['--reporter=json']), '--verbose', '--help'],
        implicit
      );
      expect(result.succeeded).toBe(true);
      expect(result.forwarded).toEqual(['list', '--help']);
      expect(result.selection).toMatchObject({
        reporter: 'legacy',
        enabled: false,
        reporterFlagsToStrip: ['--verbose'],
        outputs: []
      });
    }
  );

  it.each([false, true])(
    'runs native list with reporter --verbose (repository opt-in: %s)',
    async (implicit) => {
      const result = await executeAsync(
        ['list', ...(implicit ? [] : ['--reporter=json']), '--verbose'],
        implicit
      );
      expect(result.succeeded).toBe(true);
      expect(result.forwarded).toEqual(['list']);
      expect(result.selection.logLevel).toBe('verbose');
    }
  );

  it('preserves action-owned --verbose and every -v meaning', () => {
    for (const actionName of ['build', 'rebuild', 'check', 'custom-output']) {
      const argv: string[] = [actionName, '--reporter=plaintext', '--verbose', '-v'];
      const selection: IRushReporterSelection = select(argv, false);
      expect(
        stripReporterValueControls(
          argv,
          new Set(selection.reporterValueFlagsToStrip),
          new Set(selection.reporterFlagsToStrip)
        )
      ).toEqual([actionName, '--verbose', '-v']);
    }
    const argv: string[] = ['list', '--reporter=json', '-v', '--verbose', '--', '--verbose'];
    const selection: IRushReporterSelection = select(argv, false);
    expect(
      stripReporterValueControls(
        argv,
        new Set(selection.reporterValueFlagsToStrip),
        new Set(selection.reporterFlagsToStrip)
      )
    ).toEqual(['list', '-v', '--', '--verbose']);
  });

  it('matches the native action parameter definitions instead of registering a global verbose option', () => {
    const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: folder });
    for (const action of parser.actions) {
      if (action.actionName === 'tab-complete') continue;
      const selection: IRushReporterSelection = select(
        [action.actionName, '--reporter=json', '--verbose'],
        false
      );
      const actionOwnsVerbose: boolean = action.parameters.some(
        (parameter) => parameter.longName === '--verbose'
      );
      expect(selection.reporterFlagsToStrip ?? []).toEqual(actionOwnsVerbose ? [] : ['--verbose']);
      const valueSelection: IRushReporterSelection = select(
        [action.actionName, '--output=json://./events.jsonl', '--log-level=debug'],
        true
      );
      expect(valueSelection.reporterValueFlagsToStrip).toEqual(
        ['--output', '--log-level'].filter(
          (name) => !action.parameters.some((parameter) => parameter.longName === name)
        )
      );
    }
    expect(parser.parameters.some((parameter) => parameter.longName === '--verbose')).toBe(false);
  });

  it('parses and strips repository-level value controls before the native parser', async () => {
    const result = await executeAsync(['list', '--output=json://./events.jsonl', '--log-level=debug'], true);
    expect(result.succeeded).toBe(true);
    expect(result.forwarded).toEqual(['list']);
    expect(result.selection).toMatchObject({
      logLevel: 'debug',
      outputs: [{ reporter: 'json', target: path.join(folder, 'events.jsonl') }],
      reporterValueFlagsToStrip: ['--output', '--log-level']
    });
    expect((await fs.promises.stat(path.join(folder, 'events.jsonl'))).isFile()).toBe(true);
  });

  it('preserves declared custom values even when they look like reporter controls', async () => {
    const argv: string[] = [
      'custom-output',
      '--output=json://./custom.jsonl',
      '--log-level=debug',
      '--verbose'
    ];
    const result = await executeAsync(argv, true);
    expect(result.succeeded).toBe(true);
    expect(result.forwarded).toEqual(argv);
    expect(result.selection.outputs).toEqual([]);
    expect(
      JSON.parse(await fs.promises.readFile(path.join(folder, 'custom-output-args.json'), 'utf8'))
    ).toEqual(['--output', 'json://./custom.jsonl', '--log-level', 'debug', '--verbose']);
    await expect(fs.promises.stat(path.join(folder, 'custom.jsonl'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('claims an unowned value control without consuming a different command-owned control', async () => {
    const configPath: string = path.join(folder, 'common/config/rush/command-line.json');
    const config: { parameters: Array<{ longName: string }> } = JSON.parse(
      await fs.promises.readFile(configPath, 'utf8')
    );
    config.parameters = config.parameters.filter(({ longName }) => longName !== '--log-level');
    await fs.promises.writeFile(configPath, JSON.stringify(config));
    const result = await executeAsync(
      ['custom-output', '--output=custom-artifact.zip', '--log-level=debug'],
      true
    );
    expect(result.succeeded).toBe(true);
    expect(result.selection).toMatchObject({
      logLevel: 'debug',
      outputs: [],
      reporterValueFlagsToStrip: ['--log-level']
    });
    expect(
      JSON.parse(await fs.promises.readFile(path.join(folder, 'custom-output-args.json'), 'utf8'))
    ).toEqual(['--output', 'custom-artifact.zip']);
  });

  it('does not claim unknown or plugin-resolved command controls', async () => {
    const argv: string[] = [
      'hidden-tool',
      '--output=json://./hidden.jsonl',
      '--log-level=debug',
      '--verbose'
    ];
    expect(select(argv, true)).toMatchObject({
      outputs: [],
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: []
    });
    await fs.promises.writeFile(
      path.join(folder, 'common/config/rush/rush-plugins.json'),
      JSON.stringify({
        plugins: [{ packageName: '@example/plugin', pluginName: 'commands', autoinstallerName: 'plugins' }]
      })
    );
    expect(select(['build', '--output=json://./plugin.jsonl', '--log-level=debug'], true)).toMatchObject({
      outputs: [],
      reporterControlsOwnedByFrontend: false
    });
    await fs.promises.writeFile(
      path.join(folder, 'common/config/rush/rush-plugins.json'),
      JSON.stringify({ plugins: [] })
    );
    expect(select(['build', '--log-level=debug'], true)).toMatchObject({
      logLevel: 'debug',
      reporterValueFlagsToStrip: ['--log-level']
    });
  });

  it('keeps legacy inputs unchanged and rejects malformed owned values', () => {
    expect(select(['list', '--verbose', '--output=json://./events.jsonl'], false)).toMatchObject({
      enabled: false,
      reporterControlsOwnedByFrontend: false
    });
    expect(() => select(['build', '--output'], true)).toThrow('--output requires a value');
    expect(() => select(['build', '--log-level=unsupported'], true)).toThrow('Unsupported log level');
    expect(() => select(['build', '--log-level=debug', '--quiet'], true)).toThrow(
      'Contradictory reporter verbosity'
    );
  });
});
