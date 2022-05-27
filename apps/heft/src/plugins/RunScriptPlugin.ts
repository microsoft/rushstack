// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { HeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';

interface IRunScriptPluginOptions {
  scriptPath: string;
  scriptOptions: Record<string, unknown>;
}

/**
 * Options provided to scripts that are run using the RunScriptPlugin.
 *
 * @beta
 */
export interface IRunScriptOptions {
  heftTaskSession: HeftTaskSession;
  heftConfiguration: HeftConfiguration;
  runOptions: IHeftTaskRunHookOptions;
  scriptOptions: Record<string, unknown>;
}

/**
 * Interface used by scripts that are run by the RunScriptPlugin.
 *
 * @beta
 */
export interface IRunScript {
  runAsync?: (options: IRunScriptOptions) => Promise<void>;
}

export class RunScriptPlugin implements IHeftTaskPlugin<IRunScriptPluginOptions> {
  public readonly accessor?: object | undefined;

  public apply(
    heftTaskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IRunScriptPluginOptions
  ): void {
    heftTaskSession.hooks.run.tapPromise(
      heftTaskSession.taskName,
      async (runOptions: IHeftTaskRunHookOptions) => {
        await this._runScriptAsync(heftTaskSession, heftConfiguration, pluginOptions, runOptions);
      }
    );
  }

  private async _runScriptAsync(
    heftTaskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IRunScriptPluginOptions,
    runOptions: IHeftTaskRunHookOptions
  ): Promise<void> {
    // The scriptPath property should be fully resolved since it is included in the resolution logic used by
    // HeftConfiguration
    const resolvedModulePath: string = pluginOptions.scriptPath;

    const runScript: IRunScript = await import(resolvedModulePath);
    if (!runScript.runAsync) {
      throw new Error(`The script at "${resolvedModulePath}" doesn\'t export a "runAsync" function`);
    }

    const runScriptOptions: IRunScriptOptions = {
      heftTaskSession,
      heftConfiguration,
      runOptions,
      scriptOptions: pluginOptions.scriptOptions
    };
    await runScript.runAsync(runScriptOptions);
  }
}

export default new RunScriptPlugin() as IHeftTaskPlugin<IRunScriptPluginOptions>;
