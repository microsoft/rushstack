// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import child_process from 'node:child_process';
import path from 'node:path';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskSession
} from '@rushstack/heft';

/** @alpha */
export interface INodeTestPluginOptions {
  testPattern?: string | undefined;
}

interface INodeTestConfiguration {
  testPattern?: string;
}

const PLUGIN_NAME: 'node-test-plugin' = 'node-test-plugin';
const UPDATE_SNAPSHOTS_PARAMETER_LONG_NAME: '--update-snapshots' = '--update-snapshots';
const DEFAULT_TEST_PATTERN: string = 'test/**/*.test.mjs';
const CONFIG_FILE_NAME: string = 'node-test.json';

/**
 * @internal
 */
export default class NodeTestPlugin implements IHeftTaskPlugin<INodeTestPluginOptions> {
  private _updateSnapshots: boolean = false;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: INodeTestPluginOptions = {}
  ): void {
    this._updateSnapshots = taskSession.parameters.getFlagParameter(
      UPDATE_SNAPSHOTS_PARAMETER_LONG_NAME
    ).value;

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runNodeTestAsync(taskSession, heftConfiguration, options, runOptions.abortSignal);
    });
  }

  private async _loadConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    options: INodeTestPluginOptions
  ): Promise<INodeTestConfiguration> {
    // Try to load configuration from config/node-test.json
    const configPath: string = path.join(
      heftConfiguration.buildFolderPath,
      'config',
      CONFIG_FILE_NAME
    );

    let config: INodeTestConfiguration = {};
    if (await FileSystem.existsAsync(configPath)) {
      config = await JsonFile.loadAsync(configPath);
    }

    // Options passed via heft.json take precedence
    if (options.testPattern) {
      config.testPattern = options.testPattern;
    }

    return config;
  }

  private async _runNodeTestAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: INodeTestPluginOptions,
    abortSignal: AbortSignal
  ): Promise<void> {
    const config: INodeTestConfiguration = await this._loadConfigurationAsync(
      heftConfiguration,
      options
    );

    const testPattern: string = config.testPattern || DEFAULT_TEST_PATTERN;

    taskSession.logger.terminal.writeLine(`Running Node.js tests with pattern: ${testPattern}`);

    if (this._updateSnapshots) {
      taskSession.logger.terminal.writeLine('Updating snapshots...');
    }

    await this._executeNodeTest(
      heftConfiguration.buildFolderPath,
      testPattern,
      this._updateSnapshots,
      abortSignal,
      taskSession
    );
  }

  private async _executeNodeTest(
    buildFolderPath: string,
    testPattern: string,
    updateSnapshots: boolean,
    abortSignal: AbortSignal,
    taskSession: IHeftTaskSession
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Build the node test runner arguments
      const args: string[] = ['--test', '--test-reporter', 'spec'];

      if (updateSnapshots) {
        args.push('--test-update-snapshots');
      }

      // Add the test pattern
      args.push(testPattern);

      taskSession.logger.terminal.writeDebugLine(`Executing: node ${args.join(' ')}`);

      const child = child_process.spawn('node', args, {
        stdio: ['inherit', 'inherit', 'inherit'],
        cwd: buildFolderPath,
        env: process.env
      });

      // Handle abort signal
      const abortHandler = (): void => {
        child.kill('SIGTERM');
      };

      if (abortSignal.aborted) {
        child.kill('SIGTERM');
        reject(new Error('Operation aborted'));
        return;
      }

      abortSignal.addEventListener('abort', abortHandler);

      child.on('error', (error) => {
        abortSignal.removeEventListener('abort', abortHandler);
        reject(new Error(`Failed to spawn Node.js test process: ${error.message}`));
      });

      child.on('exit', (code, signal) => {
        abortSignal.removeEventListener('abort', abortHandler);
        if (signal === 'SIGTERM' && abortSignal.aborted) {
          reject(new Error('Operation aborted'));
        } else if (code === 0) {
          taskSession.logger.terminal.writeLine('Tests completed successfully.');
          resolve();
        } else {
          reject(new Error(`Node.js test process exited with code ${code}`));
        }
      });
    });
  }
}
