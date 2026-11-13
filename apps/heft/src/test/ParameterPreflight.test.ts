// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { JsonFile } from '@rushstack/node-core-library';

describe('Heft parameter preflight', () => {
  let projectFolder: string;
  const packageName: string = 'parameter-preflight-fixture';

  beforeEach(() => {
    projectFolder = fs.mkdtempSync(path.join(__dirname, 'parameter-preflight-'));
    fs.mkdirSync(path.join(projectFolder, 'config'));
    JsonFile.save({ name: packageName, version: '1.0.0' }, path.join(projectFolder, 'package.json'));
    JsonFile.save(
      {
        lifecyclePlugins: [
          {
            pluginName: 'lifecycle',
            entryPoint: '../fixtures/PreflightLifecyclePlugin.js',
            parameters: [
              {
                parameterKind: 'flag',
                longName: '--restricted-lifecycle',
                description: 'A restricted lifecycle parameter.',
                allowWithClean: false,
                allowInWatchMode: false
              }
            ]
          }
        ],
        taskPlugins: [
          { pluginName: 'build', entryPoint: '../fixtures/PreflightTaskPlugin.js' },
          {
            pluginName: 'test',
            entryPoint: '../fixtures/PreflightTaskPlugin.js',
            parameterScope: 'test-scope',
            parameters: [
              {
                parameterKind: 'string',
                longName: '--restricted',
                description: 'A restricted parameter.',
                argumentName: 'VALUE',
                allowWithClean: false,
                allowInWatchMode: false
              }
            ]
          }
        ]
      },
      path.join(projectFolder, 'heft-plugin.json')
    );
    JsonFile.save(
      {
        heftPlugins: [{ pluginPackage: packageName, pluginName: 'lifecycle' }],
        aliasesByName: {
          'restricted-clean': {
            actionName: 'run',
            defaultParameters: ['--to', 'test', '--', '--clean', '--restricted', 'value']
          }
        },
        phasesByName: {
          build: {
            cleanFiles: [{ sourcePath: 'build-output' }],
            tasksByName: {
              compile: { taskPlugin: { pluginPackage: packageName, pluginName: 'build' } }
            }
          },
          test: {
            phaseDependencies: ['build'],
            tasksByName: {
              check: { taskPlugin: { pluginPackage: packageName, pluginName: 'test' } }
            }
          }
        }
      },
      path.join(projectFolder, 'config', 'heft.json')
    );
    fs.mkdirSync(path.join(projectFolder, 'build-output'));
    fs.writeFileSync(path.join(projectFolder, 'build-output', 'sentinel'), 'keep build output');
    fs.writeFileSync(path.join(projectFolder, 'lifecycle-output'), 'keep lifecycle output');
  });

  afterEach(() => {
    fs.rmSync(projectFolder, { recursive: true, force: true });
  });

  function runHeft(args: string[]): SpawnSyncReturns<string> {
    const result: SpawnSyncReturns<string> = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'start.js'), ...args],
      { cwd: projectFolder, encoding: 'utf8', timeout: 15000 }
    );
    // A watch loop must exit on its own, rather than requiring the timeout to kill it.
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result;
  }

  it.each([
    ['run', '--to', 'test', '--', '--clean', '--restricted', 'value'],
    ['run', '--to', 'test', '--', '--clean', '--test-scope:restricted', 'value'],
    ['restricted-clean'],
    ['run-watch', '--to', 'test', '--', '--restricted', 'value'],
    ['test-watch', '--restricted', 'value'],
    ['run-watch', '--to', 'test', '--', '--clean', '--restricted', 'value']
  ])('rejects before lifecycle, dependency cleaning, plugin application, or watching: %j', (...args) => {
    const result: SpawnSyncReturns<string> = runHeft(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Parameter "--test-scope:restricted" from plugin "test" in package "parameter-preflight-fixture"'
    );
    expect(result.stderr).toContain(
      args.includes('--clean') || args[0] === 'restricted-clean'
        ? 'cannot be used with --clean'
        : 'cannot be used with watch mode'
    );
    expect(result.stdout).not.toContain('Waiting for changes');
    expect(fs.readFileSync(path.join(projectFolder, 'build-output', 'sentinel'), 'utf8')).toBe(
      'keep build output'
    );
    expect(fs.readFileSync(path.join(projectFolder, 'lifecycle-output'), 'utf8')).toBe(
      'keep lifecycle output'
    );
    for (const marker of ['lifecycle-applied', 'lifecycle-started', 'compile-applied', 'check-applied']) {
      expect(fs.existsSync(path.join(projectFolder, marker))).toBe(false);
    }
  });

  it('also preflights lifecycle parameters', () => {
    const result: SpawnSyncReturns<string> = runHeft([
      'run',
      '--to',
      'test',
      '--',
      '--clean',
      '--restricted-lifecycle'
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--lifecycle:restricted-lifecycle');
    expect(fs.existsSync(path.join(projectFolder, 'lifecycle-applied'))).toBe(false);
    expect(fs.existsSync(path.join(projectFolder, 'build-output', 'sentinel'))).toBe(true);
  });

  it('cleans dependency outputs and runs both phases when the restricted parameter is inactive', () => {
    const result: SpawnSyncReturns<string> = runHeft(['run', '--to', 'test', '--', '--clean']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(projectFolder, 'build-output', 'sentinel'))).toBe(false);
    expect(fs.existsSync(path.join(projectFolder, 'lifecycle-output'))).toBe(false);
    expect(fs.existsSync(path.join(projectFolder, 'compile-ran'))).toBe(true);
    expect(fs.existsSync(path.join(projectFolder, 'check-ran'))).toBe(true);
  });

  it('allows an active restricted parameter in an ordinary run without cleaning', () => {
    const result: SpawnSyncReturns<string> = runHeft(['test', '--restricted', 'value']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(projectFolder, 'check-ran'))).toBe(true);
    expect(fs.existsSync(path.join(projectFolder, 'build-output', 'sentinel'))).toBe(true);
  });

  it('leaves the standalone clean command unchanged', () => {
    const result: SpawnSyncReturns<string> = runHeft(['clean', '--to', 'test']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(projectFolder, 'build-output', 'sentinel'))).toBe(false);
    expect(fs.existsSync(path.join(projectFolder, 'lifecycle-applied'))).toBe(false);
  });
});
