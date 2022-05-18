// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { HeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';

interface IRunScriptPluginOptions {
  scriptPath: string;
  scriptOptions: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Options provided to scripts that are run using the RunScriptPlugin.
 *
 * @beta
 */
export interface IRunScriptOptions {
  scopedLogger: ScopedLogger;
  heftConfiguration: HeftConfiguration;
  debugMode: boolean;
  production: boolean;
  scriptOptions: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Interface used by scripts that are run by the RunScriptPlugin.
 */
export interface IRunScript {
  run?: (options: IRunScriptOptions) => void;
  runAsync?: (options: IRunScriptOptions) => Promise<void>;
}

export class RunScriptPlugin implements IHeftTaskPlugin<IRunScriptPluginOptions> {
  public readonly accessor?: object | undefined;

  public apply(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IRunScriptPluginOptions
  ): void {
    taskSession.hooks.run.tapAsync(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runScriptAsync(taskSession, heftConfiguration, pluginOptions, runOptions);
    });
  }

  private async _runScriptAsync(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IRunScriptPluginOptions,
    runOptions: IHeftTaskRunHookOptions
  ): Promise<void> {
    // The scriptPath property should be fully resolved since it is included in the resolution logic used by
    // HeftConfiguration
    const resolvedModulePath: string = pluginOptions.scriptPath;

    const runScript: IRunScript = await import(resolvedModulePath);
    if (runScript.run && runScript.runAsync) {
      throw new Error(`The script at "${resolvedModulePath}" exports both a "run" and a "runAsync" function`);
    } else if (!runScript.run && !runScript.runAsync) {
      throw new Error(
        `The script at "${resolvedModulePath}" doesn\'t export a "run" or a "runAsync" function`
      );
    }

    const runScriptOptions: IRunScriptOptions = {
      heftConfiguration: heftConfiguration,
      scriptOptions: pluginOptions.scriptOptions,
      scopedLogger: taskSession.logger,
      debugMode: taskSession.debugMode,
      production: runOptions.production
    };
    if (runScript.run) {
      runScript.run(runScriptOptions);
    } else if (runScript.runAsync) {
      await runScript.runAsync(runScriptOptions);
    }
  }
}

export default new RunScriptPlugin() as IHeftTaskPlugin<IRunScriptPluginOptions>;
