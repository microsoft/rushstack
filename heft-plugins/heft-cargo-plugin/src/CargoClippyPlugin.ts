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
export interface ICargoClippyPluginOptions {
  release?: boolean | undefined;
  workspace?: boolean | undefined;
  fix?: boolean | undefined;
  warningsAsErrors?: boolean | undefined;
}

interface ICargoClippyConfiguration {
  release?: boolean;
  workspace?: boolean;
  fix?: boolean;
  warningsAsErrors?: boolean;
}

const PLUGIN_NAME: 'cargo-clippy-plugin' = 'cargo-clippy-plugin';
const RELEASE_PARAMETER_LONG_NAME: '--release' = '--release';
const WORKSPACE_PARAMETER_LONG_NAME: '--workspace' = '--workspace';
const FIX_PARAMETER_LONG_NAME: '--fix' = '--fix';
const WARNINGS_AS_ERRORS_PARAMETER_LONG_NAME: '--warnings-as-errors' = '--warnings-as-errors';
const CONFIG_FILE_NAME: string = 'cargo-clippy.json';

/**
 * @internal
 */
export default class CargoClippyPlugin implements IHeftTaskPlugin<ICargoClippyPluginOptions> {
  private _releaseMode: boolean = false;
  private _workspaceMode: boolean = false;
  private _fixMode: boolean = false;
  private _warningsAsErrors: boolean = false;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoClippyPluginOptions = {}
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runCargoClippyAsync(taskSession, heftConfiguration, options, runOptions.abortSignal);
    });
  }

  private async _loadConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    options: ICargoClippyPluginOptions,
    taskSession: IHeftTaskSession
  ): Promise<ICargoClippyConfiguration> {
    // Try to load configuration from config/cargo-clippy.json
    const configPath: string = path.join(heftConfiguration.buildFolderPath, 'config', CONFIG_FILE_NAME);

    let config: ICargoClippyConfiguration = {};
    if (await FileSystem.existsAsync(configPath)) {
      taskSession.logger.terminal.writeDebugLine(`Loading configuration from ${configPath}`);
      config = await JsonFile.loadAsync(configPath);
    }

    // CLI parameters take highest precedence
    const releaseParam = taskSession.parameters.getFlagParameter(RELEASE_PARAMETER_LONG_NAME).value;
    const workspaceParam = taskSession.parameters.getFlagParameter(WORKSPACE_PARAMETER_LONG_NAME).value;
    const fixParam = taskSession.parameters.getFlagParameter(FIX_PARAMETER_LONG_NAME).value;
    const warningsAsErrorsParam = taskSession.parameters.getFlagParameter(
      WARNINGS_AS_ERRORS_PARAMETER_LONG_NAME
    ).value;

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

    if (fixParam) {
      config.fix = true;
    } else if (options.fix !== undefined) {
      config.fix = options.fix;
    }

    if (warningsAsErrorsParam) {
      config.warningsAsErrors = true;
    } else if (options.warningsAsErrors !== undefined) {
      config.warningsAsErrors = options.warningsAsErrors;
    }

    return config;
  }

  private async _runCargoClippyAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoClippyPluginOptions,
    abortSignal: AbortSignal
  ): Promise<void> {
    const config: ICargoClippyConfiguration = await this._loadConfigurationAsync(
      heftConfiguration,
      options,
      taskSession
    );

    this._releaseMode = config.release || false;
    this._workspaceMode = config.workspace || false;
    this._fixMode = config.fix || false;
    this._warningsAsErrors = config.warningsAsErrors || false;

    taskSession.logger.terminal.writeLine('Running Cargo clippy...');

    if (this._releaseMode) {
      taskSession.logger.terminal.writeLine('Using release mode');
    }

    if (this._workspaceMode) {
      taskSession.logger.terminal.writeLine('Running clippy for all workspace packages');
    }

    if (this._fixMode) {
      taskSession.logger.terminal.writeLine('Auto-fixing issues where possible');
    }

    if (this._warningsAsErrors) {
      taskSession.logger.terminal.writeLine('Treating warnings as errors');
    }

    await this._executeCargoClippy(
      heftConfiguration.buildFolderPath,
      this._releaseMode,
      this._workspaceMode,
      this._fixMode,
      this._warningsAsErrors,
      abortSignal,
      taskSession
    );
  }

  private async _executeCargoClippy(
    buildFolderPath: string,
    releaseMode: boolean,
    workspaceMode: boolean,
    fixMode: boolean,
    warningsAsErrors: boolean,
    abortSignal: AbortSignal,
    taskSession: IHeftTaskSession
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args: string[] = ['clippy'];

      if (releaseMode) {
        args.push('--release');
      }

      if (workspaceMode) {
        args.push('--workspace');
      }

      if (fixMode) {
        args.push('--fix', '--allow-dirty', '--allow-staged');
      }

      // Add clippy-specific arguments after --
      if (warningsAsErrors) {
        args.push('--', '-D', 'warnings');
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
        reject(new Error(`Failed to spawn Cargo clippy process: ${error.message}`));
      });

      child.on('exit', (code, signal) => {
        abortSignal.removeEventListener('abort', abortHandler);
        if (signal === 'SIGTERM' && abortSignal.aborted) {
          reject(new Error('Operation aborted'));
        } else if (code === 0) {
          taskSession.logger.terminal.writeLine('Cargo clippy completed successfully.');
          resolve();
        } else {
          reject(new Error(`Cargo clippy process exited with code ${code}`));
        }
      });
    });
  }
}
