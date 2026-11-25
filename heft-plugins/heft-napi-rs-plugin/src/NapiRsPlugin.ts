// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import child_process from 'node:child_process';
import path from 'node:path';
import type * as TNapiRsCli from '@napi-rs/cli';
import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskSession
} from '@rushstack/heft';
import { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook } from 'tapable';
import { tryLoadNapiRsConfigurationAsync } from './NapiRsConfigurationLoader';
import {
  INapiRsPluginAccessor,
  INapiRsConfiguration,
  PLUGIN_NAME,
  INapiRsPluginAccessorHooks,
  NapiCli
} from './shared';

export interface INapiRsPluginOptions {
  configurationPath?: string | undefined;
}

const NAPI_RS_CLI_PACKAGE_NAME: '@napi-rs/cli' = '@napi-rs/cli';

/**
 * @internal
 */
export default class NapiRsPlugin implements IHeftTaskPlugin<INapiRsPluginOptions> {
  private _accessor: INapiRsPluginAccessor | undefined;
  private _napiRs: typeof TNapiRsCli | undefined;
  private _napiRsCli: NapiCli | undefined;
  private _napiRsConfiguration: INapiRsConfiguration | undefined | false = false;

  public get accessor(): INapiRsPluginAccessor {
    if (!this._accessor) {
      this._accessor = {
        hooks: _createAccessorHooks(),
        parameters: {}
      };
    }
    return this._accessor;
  }

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: INapiRsPluginOptions = {}
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async ({ abortSignal }: IHeftTaskRunHookOptions) => {
      // Load the config and compiler, and return if there is no config found
      const napiRsConfiguration: INapiRsConfiguration | undefined = await this._getNapiRsConfigurationAsync(
        taskSession,
        heftConfiguration,
        options
      );
      if (!napiRsConfiguration) {
        return;
      }
      taskSession.logger.terminal.writeLine('Running NAPI-RS compilation');

      // NAPI-RS CLI writes its status messages to stderr, which Rush treats as warnings.
      // Fork the process to run cli.build to prevent stderr from being seen by Rush
      await this._runNapiRsBuildInFork(napiRsConfiguration, abortSignal, taskSession);
      taskSession.logger.terminal.writeLine(`NAPI-RS compilation complete.`);
    });
  }

  private async _getNapiRsConfigurationAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: INapiRsPluginOptions,
    _requestRun?: () => void
  ): Promise<INapiRsConfiguration | undefined> {
    if (this._napiRsConfiguration === false) {
      const napiRsConfiguration: INapiRsConfiguration | undefined = await tryLoadNapiRsConfigurationAsync(
        {
          taskSession,
          heftConfiguration,
          hooks: this.accessor.hooks,
          loadNapiRsAsyncFn: this._loadNapiRsAsync.bind(this, taskSession, heftConfiguration)
        },
        options
      );

      this._napiRsConfiguration = napiRsConfiguration;
    }

    return this._napiRsConfiguration;
  }

  private async _loadNapiRsAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<typeof TNapiRsCli> {
    if (!this._napiRs) {
      try {
        const napiRsPackagePath: string = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
          NAPI_RS_CLI_PACKAGE_NAME,
          taskSession.logger.terminal
        );
        this._napiRs = await import(napiRsPackagePath);
      } catch (e) {
        // Fallback to bundled version if not found in rig.
        this._napiRs = await import(NAPI_RS_CLI_PACKAGE_NAME);
        taskSession.logger.terminal.writeDebugLine(
          `Using NAPI-RS from built-in "${NAPI_RS_CLI_PACKAGE_NAME}"`
        );
      }
    }
    return this._napiRs!;
  }

  private async _runNapiRsBuildInFork(
    napiRsConfiguration: INapiRsConfiguration,
    abortSignal: AbortSignal,
    taskSession: IHeftTaskSession
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Path to the worker script
      const workerPath = path.resolve(__dirname, 'napiRsBuildWorker.js');
      const configJson = JSON.stringify(napiRsConfiguration.build);

      const child = child_process.spawn('node', [workerPath, configJson], {
        stdio: ['inherit', 'inherit', 1], // Redirect stderr to stdout
        cwd: process.cwd(),
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
        reject(new Error(`Failed to spawn NAPI-RS build process: ${error.message}`));
      });

      child.on('exit', (code, signal) => {
        abortSignal.removeEventListener('abort', abortHandler);
        if (signal === 'SIGTERM' && abortSignal.aborted) {
          reject(new Error('Operation aborted'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`NAPI-RS build process exited with code ${code}`));
        }
      });
    });
  }
}

/**
 * @internal
 */
export function _createAccessorHooks(): INapiRsPluginAccessorHooks {
  return {
    onLoadConfiguration: new AsyncSeriesBailHook(),
    onConfigure: new AsyncSeriesHook(['napiRsConfiguration']),
    onAfterConfigure: new AsyncParallelHook(['napiRsConfiguration'])
  };
}
