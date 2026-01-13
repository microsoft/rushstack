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
export interface ICargoFmtPluginOptions {
  workspace?: boolean | undefined;
  check?: boolean | undefined;
}

interface ICargoFmtConfiguration {
  workspace?: boolean;
  check?: boolean;
}

const PLUGIN_NAME: 'cargo-fmt-plugin' = 'cargo-fmt-plugin';
const WORKSPACE_PARAMETER_LONG_NAME: '--workspace' = '--workspace';
const CHECK_PARAMETER_LONG_NAME: '--check' = '--check';
const CONFIG_FILE_NAME: string = 'cargo-fmt.json';

/**
 * @internal
 */
export default class CargoFmtPlugin implements IHeftTaskPlugin<ICargoFmtPluginOptions> {
  private _workspaceMode: boolean = false;
  private _checkMode: boolean = false;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoFmtPluginOptions = {}
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runCargoFmtAsync(taskSession, heftConfiguration, options, runOptions.abortSignal);
    });
  }

  private async _loadConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    options: ICargoFmtPluginOptions,
    taskSession: IHeftTaskSession
  ): Promise<ICargoFmtConfiguration> {
    // Try to load configuration from config/cargo-fmt.json
    const configPath: string = path.join(heftConfiguration.buildFolderPath, 'config', CONFIG_FILE_NAME);

    let config: ICargoFmtConfiguration = {};
    if (await FileSystem.existsAsync(configPath)) {
      taskSession.logger.terminal.writeDebugLine(`Loading configuration from ${configPath}`);
      config = await JsonFile.loadAsync(configPath);
    }

    // CLI parameters take highest precedence
    const workspaceParam = taskSession.parameters.getFlagParameter(WORKSPACE_PARAMETER_LONG_NAME).value;
    const checkParam = taskSession.parameters.getFlagParameter(CHECK_PARAMETER_LONG_NAME).value;

    // Priority: CLI params > heft.json options > config file
    if (workspaceParam) {
      config.workspace = true;
    } else if (options.workspace !== undefined) {
      config.workspace = options.workspace;
    }

    if (checkParam) {
      config.check = true;
    } else if (options.check !== undefined) {
      config.check = options.check;
    }

    return config;
  }

  private async _runCargoFmtAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoFmtPluginOptions,
    abortSignal: AbortSignal
  ): Promise<void> {
    const config: ICargoFmtConfiguration = await this._loadConfigurationAsync(
      heftConfiguration,
      options,
      taskSession
    );

    this._workspaceMode = config.workspace || false;
    this._checkMode = config.check || false;

    taskSession.logger.terminal.writeLine('Running Cargo fmt...');

    if (this._workspaceMode) {
      taskSession.logger.terminal.writeLine('Formatting all workspace packages');
    }

    if (this._checkMode) {
      taskSession.logger.terminal.writeLine('Running in check mode (no files will be modified)');
    }

    await this._executeCargoFmt(
      heftConfiguration.buildFolderPath,
      this._workspaceMode,
      this._checkMode,
      abortSignal,
      taskSession
    );
  }

  private async _executeCargoFmt(
    buildFolderPath: string,
    workspaceMode: boolean,
    checkMode: boolean,
    abortSignal: AbortSignal,
    taskSession: IHeftTaskSession
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args: string[] = ['fmt'];

      if (workspaceMode) {
        args.push('--all');
      }

      if (checkMode) {
        args.push('--check');
      }

      taskSession.logger.terminal.writeDebugLine(`Executing: cargo ${args.join(' ')}`);

      const child = child_process.spawn('cargo', args, {
        stdio: ['inherit', 'inherit', 1], // Redirect stderr to stdout
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
        reject(new Error(`Failed to spawn Cargo fmt process: ${error.message}`));
      });

      child.on('exit', (code, signal) => {
        abortSignal.removeEventListener('abort', abortHandler);
        if (signal === 'SIGTERM' && abortSignal.aborted) {
          reject(new Error('Operation aborted'));
        } else if (code === 0) {
          taskSession.logger.terminal.writeLine('Cargo fmt completed successfully.');
          resolve();
        } else {
          if (checkMode) {
            reject(new Error(`Cargo fmt check failed - code is not properly formatted (exit code ${code})`));
          } else {
            reject(new Error(`Cargo fmt process exited with code ${code}`));
          }
        }
      });
    });
  }
}
