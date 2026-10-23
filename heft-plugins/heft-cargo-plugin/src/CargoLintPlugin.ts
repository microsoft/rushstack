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
export interface ICargoLintPluginOptions {
  release?: boolean | undefined;
  workspace?: boolean | undefined;
  warningsAsErrors?: boolean | undefined;
  skipFmt?: boolean | undefined;
  skipClippy?: boolean | undefined;
}

interface ICargoLintConfiguration {
  release?: boolean;
  workspace?: boolean;
  warningsAsErrors?: boolean;
  skipFmt?: boolean;
  skipClippy?: boolean;
}

const PLUGIN_NAME: 'cargo-lint-plugin' = 'cargo-lint-plugin';
const RELEASE_PARAMETER_LONG_NAME: '--release' = '--release';
const WORKSPACE_PARAMETER_LONG_NAME: '--workspace' = '--workspace';
const WARNINGS_AS_ERRORS_PARAMETER_LONG_NAME: '--warnings-as-errors' = '--warnings-as-errors';
const SKIP_FMT_PARAMETER_LONG_NAME: '--skip-fmt' = '--skip-fmt';
const SKIP_CLIPPY_PARAMETER_LONG_NAME: '--skip-clippy' = '--skip-clippy';
const CONFIG_FILE_NAME: string = 'cargo-lint.json';

/**
 * A combined linting plugin that runs both cargo clippy and cargo fmt --check.
 * @internal
 */
export default class CargoLintPlugin implements IHeftTaskPlugin<ICargoLintPluginOptions> {
  private _releaseMode: boolean = false;
  private _workspaceMode: boolean = false;
  private _warningsAsErrors: boolean = false;
  private _skipFmt: boolean = false;
  private _skipClippy: boolean = false;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoLintPluginOptions = {}
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runCargoLintAsync(taskSession, heftConfiguration, options, runOptions.abortSignal);
    });
  }

  private async _loadConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    options: ICargoLintPluginOptions,
    taskSession: IHeftTaskSession
  ): Promise<ICargoLintConfiguration> {
    // Try to load configuration from config/cargo-lint.json
    const configPath: string = path.join(heftConfiguration.buildFolderPath, 'config', CONFIG_FILE_NAME);

    let config: ICargoLintConfiguration = {};
    if (await FileSystem.existsAsync(configPath)) {
      taskSession.logger.terminal.writeDebugLine(`Loading configuration from ${configPath}`);
      config = await JsonFile.loadAsync(configPath);
    }

    // CLI parameters take highest precedence
    const releaseParam = taskSession.parameters.getFlagParameter(RELEASE_PARAMETER_LONG_NAME).value;
    const workspaceParam = taskSession.parameters.getFlagParameter(WORKSPACE_PARAMETER_LONG_NAME).value;
    const warningsAsErrorsParam = taskSession.parameters.getFlagParameter(
      WARNINGS_AS_ERRORS_PARAMETER_LONG_NAME
    ).value;
    const skipFmtParam = taskSession.parameters.getFlagParameter(SKIP_FMT_PARAMETER_LONG_NAME).value;
    const skipClippyParam = taskSession.parameters.getFlagParameter(SKIP_CLIPPY_PARAMETER_LONG_NAME).value;

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

    if (warningsAsErrorsParam) {
      config.warningsAsErrors = true;
    } else if (options.warningsAsErrors !== undefined) {
      config.warningsAsErrors = options.warningsAsErrors;
    }

    if (skipFmtParam) {
      config.skipFmt = true;
    } else if (options.skipFmt !== undefined) {
      config.skipFmt = options.skipFmt;
    }

    if (skipClippyParam) {
      config.skipClippy = true;
    } else if (options.skipClippy !== undefined) {
      config.skipClippy = options.skipClippy;
    }

    return config;
  }

  private async _runCargoLintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ICargoLintPluginOptions,
    abortSignal: AbortSignal
  ): Promise<void> {
    const config: ICargoLintConfiguration = await this._loadConfigurationAsync(
      heftConfiguration,
      options,
      taskSession
    );

    this._releaseMode = config.release || false;
    this._workspaceMode = config.workspace || false;
    this._warningsAsErrors = config.warningsAsErrors || false;
    this._skipFmt = config.skipFmt || false;
    this._skipClippy = config.skipClippy || false;

    taskSession.logger.terminal.writeLine('Running Cargo lint...');

    if (this._releaseMode) {
      taskSession.logger.terminal.writeLine('Using release mode');
    }

    if (this._workspaceMode) {
      taskSession.logger.terminal.writeLine('Linting all workspace packages');
    }

    if (this._warningsAsErrors) {
      taskSession.logger.terminal.writeLine('Treating warnings as errors');
    }

    // Run cargo fmt --check first (if not skipped)
    if (!this._skipFmt) {
      await this._executeCargoFmtCheck(
        heftConfiguration.buildFolderPath,
        this._workspaceMode,
        abortSignal,
        taskSession
      );
    } else {
      taskSession.logger.terminal.writeLine('Skipping cargo fmt check');
    }

    // Run cargo clippy (if not skipped)
    if (!this._skipClippy) {
      await this._executeCargoClippy(
        heftConfiguration.buildFolderPath,
        this._releaseMode,
        this._workspaceMode,
        this._warningsAsErrors,
        abortSignal,
        taskSession
      );
    } else {
      taskSession.logger.terminal.writeLine('Skipping cargo clippy');
    }

    taskSession.logger.terminal.writeLine('Cargo lint completed successfully.');
  }

  private async _executeCargoFmtCheck(
    buildFolderPath: string,
    workspaceMode: boolean,
    abortSignal: AbortSignal,
    taskSession: IHeftTaskSession
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args: string[] = ['fmt', '--check'];

      if (workspaceMode) {
        args.push('--all');
      }

      taskSession.logger.terminal.writeLine('Checking code formatting with cargo fmt...');
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
          taskSession.logger.terminal.writeLine('Code formatting check passed.');
          resolve();
        } else {
          reject(
            new Error(
              `Code formatting check failed - run "cargo fmt" to fix formatting issues (exit code ${code})`
            )
          );
        }
      });
    });
  }

  private async _executeCargoClippy(
    buildFolderPath: string,
    releaseMode: boolean,
    workspaceMode: boolean,
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

      // Add clippy-specific arguments after --
      if (warningsAsErrors) {
        args.push('--', '-D', 'warnings');
      }

      taskSession.logger.terminal.writeLine('Running cargo clippy...');
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
          taskSession.logger.terminal.writeLine('Cargo clippy check passed.');
          resolve();
        } else {
          reject(new Error(`Cargo clippy found issues (exit code ${code})`));
        }
      });
    });
  }
}
