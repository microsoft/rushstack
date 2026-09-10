// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as rushLib from '@microsoft/rush-lib';
import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';

import { launchRushFrontendAsync } from '../RushFrontend';
import type { MinimalRushConfiguration } from '../MinimalRushConfiguration';

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
});
