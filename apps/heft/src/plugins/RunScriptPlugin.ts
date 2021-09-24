// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';

import { HeftEventPluginBase } from '../pluginFramework/HeftEventPluginBase';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import {
  IHeftEventActions,
  IHeftConfigurationRunScriptEventAction,
  HeftEvent
} from '../utilities/CoreConfigFiles';
import { IBuildStageProperties } from '../stages/BuildStage';
import { ITestStageProperties } from '../stages/TestStage';
import { Constants } from '../utilities/Constants';

/**
 * Interface used by scripts that are run by the RunScriptPlugin.
 */
interface IRunScript<TStageProperties> {
  run?: (options: IRunScriptOptions<TStageProperties>) => void;
  runAsync?: (options: IRunScriptOptions<TStageProperties>) => Promise<void>;
}

/**
 * Options provided to scripts that are run using the RunScriptPlugin.
 *
 * @beta
 */
export interface IRunScriptOptions<TStageProperties> {
  scopedLogger: ScopedLogger;
  heftConfiguration: HeftConfiguration;
  debugMode: boolean;
  properties: TStageProperties;
  scriptOptions: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class RunScriptPlugin extends HeftEventPluginBase<IHeftConfigurationRunScriptEventAction> {
  public readonly pluginName: string = 'RunScriptPlugin';
  protected readonly eventActionName: keyof IHeftEventActions = 'runScript';
  protected readonly loggerName: string = 'run-script';

  /**
   * @override
   */
  protected async handleBuildEventActionsAsync(
    heftEvent: HeftEvent,
    runScriptEventActions: IHeftConfigurationRunScriptEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: IBuildStageProperties
  ): Promise<void> {
    await this._runScriptsForHeftEventActions(
      runScriptEventActions,
      logger,
      heftSession,
      heftConfiguration,
      properties
    );
  }

  /**
   * @override
   */
  protected async handleTestEventActionsAsync(
    heftEvent: HeftEvent,
    runScriptEventActions: IHeftConfigurationRunScriptEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: ITestStageProperties
  ): Promise<void> {
    await this._runScriptsForHeftEventActions(
      runScriptEventActions,
      logger,
      heftSession,
      heftConfiguration,
      properties
    );
  }

  private async _runScriptsForHeftEventActions<TStageProperties>(
    runScriptEventActions: IHeftConfigurationRunScriptEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: TStageProperties
  ): Promise<void> {
    await Async.forEachAsync(
      runScriptEventActions,
      async (runScriptEventAction) => {
        // The scriptPath property should be fully resolved since it is included in the resolution logic used by
        // HeftConfiguration
        const resolvedModulePath: string = runScriptEventAction.scriptPath;

        // Use the HeftEvent.actionId field for the logger since this should identify the HeftEvent that the
        // script is sourced from. This is also a bit more user-friendly and customizable than simply using
        // the script name for the logger. We will also prefix the logger name with the plugin name to clarify
        // that the output is coming from the RunScriptPlugin.
        const scriptLogger: ScopedLogger = heftSession.requestScopedLogger(
          `${logger.loggerName}:${runScriptEventAction.actionId}`
        );

        const runScript: IRunScript<TStageProperties> = require(resolvedModulePath);
        if (runScript.run && runScript.runAsync) {
          throw new Error(
            `The script at "${resolvedModulePath}" exports both a "run" and a "runAsync" function`
          );
        } else if (!runScript.run && !runScript.runAsync) {
          throw new Error(
            `The script at "${resolvedModulePath}" doesn\'t export a "run" or a "runAsync" function`
          );
        }

        const runScriptOptions: IRunScriptOptions<TStageProperties> = {
          scopedLogger: scriptLogger,
          debugMode: heftSession.debugMode,
          scriptOptions: runScriptEventAction.scriptOptions,
          heftConfiguration,
          properties
        };
        if (runScript.run) {
          runScript.run(runScriptOptions);
        } else if (runScript.runAsync) {
          await runScript.runAsync(runScriptOptions);
        }
      },
      { concurrency: Constants.maxParallelism }
    );
  }
}
