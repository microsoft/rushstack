// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { installAndRun } from '../install-run';

describe('install-run npm environment', () => {
  let originalEnvironment: NodeJS.ProcessEnv;
  let directory: string;
  let spawn: jest.SpyInstance;

  beforeEach(() => {
    originalEnvironment = process.env;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'install-run-env-test-'));
    process.env = {
      PATH: originalEnvironment.PATH,
      RUSH_TEMP_FOLDER: directory,
      INIT_CWD: '/unrelated/project',
      npm_config_registry: 'https://unrelated.example.test/',
      NPM_CONFIG_CACHE: '/unrelated/cache',
      Npm_Config_UserConfig: '/unrelated/npmrc',
      RUSH_TEST_TOKEN: 'test-token',
      npm_lifecycle_event: 'test'
    };
    jest.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from(process.execPath));
    spawn = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
      pid: 1,
      output: [],
      stdout: Buffer.from('"1.0.0"'),
      stderr: Buffer.alloc(0),
      status: 0,
      signal: null
    });
  });

  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function getSpawnEnvironment(index: number): NodeJS.ProcessEnv {
    const call = spawn.mock.calls[index];
    const options: childProcess.SpawnSyncOptions = call[call.length - 1];
    return options.env!;
  }

  function expectNpmEnvironment(environment: NodeJS.ProcessEnv): void {
    expect(environment.INIT_CWD).toBeUndefined();
    expect(environment.npm_config_registry).toBeUndefined();
    expect(environment.NPM_CONFIG_CACHE).toBeUndefined();
    expect(environment.Npm_Config_UserConfig).toBeUndefined();
    expect(environment.RUSH_TEST_TOKEN).toBe('test-token');
    expect(environment.npm_lifecycle_event).toBe('test');
    expect(environment.PATH).toBe(process.env.PATH);
  }

  it.each([
    { command: 'install', capture: false },
    { command: 'install', capture: true },
    { command: 'ci', capture: false },
    { command: 'ci', capture: true }
  ])('filters the npm $command environment with capture=$capture', ({ command, capture }) => {
    const lockFilePath: string | undefined = command === 'ci' ? path.join(directory, 'lock.json') : undefined;
    if (lockFilePath) {
      fs.writeFileSync(lockFilePath, '{}');
    }
    const environment: NodeJS.ProcessEnv = { ...process.env };
    expect(
      installAndRun(
        { info: () => {}, error: () => {} },
        'test-package',
        '1.0.0',
        'test-command',
        [],
        lockFilePath,
        { onExternalOutput: capture ? () => {} : undefined }
      )
    ).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(2);
    expectNpmEnvironment(getSpawnEnvironment(0));
    expect(getSpawnEnvironment(1)).toBe(process.env);
    expect(process.env).toEqual(environment);
  });

  it('filters the npm view environment when resolving a package version', () => {
    const originalArgv: string[] = process.argv;
    const originalExitCode: number | string | undefined = process.exitCode;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.argv = [process.execPath, 'install-run.js', 'test-package@^1.0.0', 'test-command'];
      jest.isolateModules(() => {
        jest.requireActual('../install-run');
      });

      expect(process.exitCode).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(3);
      expectNpmEnvironment(getSpawnEnvironment(0));
      expectNpmEnvironment(getSpawnEnvironment(1));
      expect(getSpawnEnvironment(2)).toBe(process.env);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
