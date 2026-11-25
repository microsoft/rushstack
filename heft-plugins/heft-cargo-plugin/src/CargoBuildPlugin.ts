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
export interface ICargoBuildPluginOptions {
  release?: boolean | undefined;
  workspace?: boolean | undefined;
}

interface ICargoBuildConfiguration {
  release?: boolean;
  workspace?: boolean;
}

const PLUGIN_NAME: 'cargo-build-plugin' = 'cargo-build-plugin';
const RELEASE_PARAMETER_LONG_NAME: '--release' = '--release';
const WORKSPACE_PARAMETER_LONG_NAME: '--workspace' = '--workspace';
const CONFIG_FILE_NAME: string = 'cargo-build.json';

/**
 * @internal
 */
export default class CargoBuildPlugin implements IHeftTaskPlugin<ICargoBuildPluginOptions> {
  private _releaseMode: boolean = false;
  private _workspaceMode: boolean = false;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoBuildPluginOptions = {}
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runCargoBuildAsync(taskSession, heftConfiguration, options, runOptions.abortSignal);
    });
  }

  private async _loadConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    options: ICargoBuildPluginOptions,
    taskSession: IHeftTaskSession
  ): Promise<ICargoBuildConfiguration> {
    // Try to load configuration from config/cargo-build.json
    const configPath: string = path.join(heftConfiguration.buildFolderPath, 'config', CONFIG_FILE_NAME);

    let config: ICargoBuildConfiguration = {};
    if (await FileSystem.existsAsync(configPath)) {
      taskSession.logger.terminal.writeDebugLine(`Loading configuration from ${configPath}`);
      config = await JsonFile.loadAsync(configPath);
    }

    // CLI parameters take highest precedence
    const releaseParam = taskSession.parameters.getFlagParameter(RELEASE_PARAMETER_LONG_NAME).value;
    const workspaceParam = taskSession.parameters.getFlagParameter(WORKSPACE_PARAMETER_LONG_NAME).value;

    // Priority: CLI params > heft.json options > config file
    if (releaseParam) {
      config.release = true;
    } else if (options.release !== undefined) {
      config.release = options.release;
    }

    if (workspaceParam) {
      config.workspace = true;
    } else if (options.workspace !== undefined) {
      config.workspace = options.workspace;
    }

    return config;
  }

  private async _runCargoBuildAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoBuildPluginOptions,
    abortSignal: AbortSignal
  ): Promise<void> {
    const config: ICargoBuildConfiguration = await this._loadConfigurationAsync(
      heftConfiguration,
      options,
      taskSession
    );

    this._releaseMode = config.release || false;
    this._workspaceMode = config.workspace || false;

    taskSession.logger.terminal.writeLine('Running Cargo build...');

    if (this._releaseMode) {
      taskSession.logger.terminal.writeLine('Using release mode');
    }

    if (this._workspaceMode) {
      taskSession.logger.terminal.writeLine('Building all workspace packages');
    }

    await this._executeCargoBuild(
      heftConfiguration.buildFolderPath,
      this._releaseMode,
      this._workspaceMode,
      abortSignal,
      taskSession
    );
  }

  private async _executeCargoBuild(
    buildFolderPath: string,
    releaseMode: boolean,
    workspaceMode: boolean,
    abortSignal: AbortSignal,
    taskSession: IHeftTaskSession
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args: string[] = ['build'];

      if (releaseMode) {
        args.push('--release');
      }

      if (workspaceMode) {
        args.push('--workspace');
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
        reject(new Error(`Failed to spawn Cargo build process: ${error.message}`));
      });

      child.on('exit', (code, signal) => {
        abortSignal.removeEventListener('abort', abortHandler);
        if (signal === 'SIGTERM' && abortSignal.aborted) {
          reject(new Error('Operation aborted'));
        } else if (code === 0) {
          taskSession.logger.terminal.writeLine('Cargo build completed successfully.');
          resolve();
        } else {
          reject(new Error(`Cargo build process exited with code ${code}`));
        }
      });
    });
  }
}
