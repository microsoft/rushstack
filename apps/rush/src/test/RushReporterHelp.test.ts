// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as rushLib from '@microsoft/rush-lib';
import type { ICommandLineJson } from '@microsoft/rush-lib/lib/api/CommandLineJson';
import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';
import { JsonFile } from '@rushstack/node-core-library';

import { launchRushFrontendAsync } from '../RushFrontend';
import { MinimalRushConfiguration } from '../MinimalRushConfiguration';

describe('reporter help forwarding', () => {
  it.each([false, true])('forwards only help to the real engine with repository opt-in %s', async (optIn) => {
    const originalArgv: string[] = process.argv;
    const originalEnv: NodeJS.ProcessEnv = { ...process.env };
    const originalExitCode: typeof process.exitCode = process.exitCode;
    const output: string[] = [];
    const errors: string[] = [];
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((text) => {
      output.push(String(text));
      return true;
    });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((text) => {
      errors.push(String(text));
      return true;
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation((text) => output.push(String(text)));
    process.argv = [
      'node',
      'rush',
      'build',
      ...(optIn ? [] : ['--reporter=json']),
      '--output=json://./help-events.jsonl',
      '--log-level=debug',
      '--help'
    ];
    delete process.env.RUSH_REPORTER;
    process.env.RUSH_LOG_LEVEL = 'debug';
    try {
      EnvironmentConfiguration.reset();
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: { useRushReporter: optIn } as MinimalRushConfiguration,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        executeCurrentRush: (version, selectedRushLib, options) => {
          void version;
          void selectedRushLib;
          expect(process.argv).toEqual(['node', 'rush', 'build', '--help']);
          expect(process.env.RUSH_LOG_LEVEL).toBeUndefined();
          expect(options.reporter.operationStreamEnabled).toBe(false);
          const parser: RushCommandLineParser = new RushCommandLineParser({
            cwd: path.resolve(
              __dirname,
              '../../../../libraries/rush-lib/src/cli/test/basicAndRunBuildActionRepo'
            ),
            reporterCloseAsync: options.reporterCloseAsync
          });
          return parser.executeAsync().then((succeeded) => {
            expect(succeeded).toBe(true);
          });
        }
      });
      expect(output.join('')).toContain('usage: rush build');
      expect(errors).toEqual([]);
    } finally {
      process.argv = originalArgv;
      process.env = originalEnv;
      process.exitCode = originalExitCode;
      EnvironmentConfiguration.reset();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it.each([
    { command: 'custom-output', globalHelp: false, customValueControls: ['--output', '--log-level'] },
    { command: 'custom-output', globalHelp: true, customValueControls: ['--output', '--log-level'] },
    { command: 'build', globalHelp: false, customValueControls: ['--output', '--log-level'] },
    { command: 'custom-output', globalHelp: false, customValueControls: ['--output'] },
    { command: 'custom-output', globalHelp: false, customValueControls: ['--log-level'] }
  ])('preserves declared reporter-shaped parameters for opted-in help: %j', async (testCase) => {
    const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-custom-help-'));
    const repoPath: string = path.join(directory, 'repo');
    await fs.promises.cp(
      path.resolve(__dirname, '../../../../libraries/rush-lib/src/cli/test/basicAndRunBuildActionRepo'),
      repoPath,
      { recursive: true }
    );
    const commandLinePath: string = path.join(repoPath, 'common/config/rush/command-line.json');
    const commandLine: ICommandLineJson = JsonFile.load(commandLinePath);
    commandLine.parameters = commandLine.parameters?.filter(
      (parameter) =>
        (parameter.longName !== '--output' && parameter.longName !== '--log-level') ||
        testCase.customValueControls.includes(parameter.longName)
    );
    for (const parameter of commandLine.parameters ?? []) {
      if (parameter.longName === '--output' || parameter.longName === '--log-level') {
        parameter.associatedCommands?.push('build');
      }
    }
    JsonFile.save(commandLine, commandLinePath);
    const originalArgv: string[] = process.argv;
    const originalEnv: NodeJS.ProcessEnv = { ...process.env };
    const originalExitCode: typeof process.exitCode = process.exitCode;
    const output: string[] = [];
    const errors: string[] = [];
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((text) => {
      output.push(String(text));
      return true;
    });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((text) => {
      errors.push(String(text));
      return true;
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation((text) => output.push(String(text)));
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(repoPath);
    process.argv = [
      'node',
      'rush',
      ...(testCase.globalHelp ? ['--help'] : []),
      testCase.command,
      '--output=json://./custom-events.jsonl',
      '--log-level=debug',
      '--verbose',
      ...(testCase.globalHelp ? [] : ['--help'])
    ];
    const expectedArgv: string[] = process.argv.filter(
      (argument) =>
        (!argument.startsWith('--output=') || testCase.customValueControls.includes('--output')) &&
        (!argument.startsWith('--log-level=') || testCase.customValueControls.includes('--log-level'))
    );
    delete process.env.RUSH_REPORTER;
    delete process.env.RUSH_LOG_LEVEL;
    try {
      EnvironmentConfiguration.reset();
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: { useRushReporter: true } as MinimalRushConfiguration,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        executeCurrentRush: (version, selectedRushLib, options) => {
          void version;
          void selectedRushLib;
          const forwardedArgv: string[] = [...process.argv];
          const parser: RushCommandLineParser = new RushCommandLineParser({
            cwd: repoPath,
            reporterCloseAsync: options.reporterCloseAsync
          });
          return parser.executeAsync().then((succeeded) => {
            expect(succeeded).toBe(true);
            expect(forwardedArgv).toEqual(expectedArgv);
          });
        }
      });
      expect(output.join('')).toContain(
        testCase.globalHelp ? 'usage: rush' : `usage: rush ${testCase.command}`
      );
      expect(errors).toEqual([]);
      expect(fs.existsSync(path.join(repoPath, 'custom-events.jsonl'))).toBe(false);
      expect(fs.existsSync(path.join(repoPath, 'custom-output-args.json'))).toBe(false);

      await fs.promises.writeFile(path.join(repoPath, 'rush.json'), '{ malformed rush.json');
      logSpy.mockClear();
      expect(MinimalRushConfiguration.loadFromDefaultLocation()).toBeUndefined();
      expect(logSpy.mock.calls).toEqual([
        [`Found configuration in ${path.join(repoPath, 'rush.json')}`],
        ['']
      ]);
    } finally {
      process.argv = originalArgv;
      process.env = originalEnv;
      process.exitCode = originalExitCode;
      EnvironmentConfiguration.reset();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      logSpy.mockRestore();
      cwdSpy.mockRestore();
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
