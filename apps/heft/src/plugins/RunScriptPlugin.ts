// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal } from '@rushstack/node-core-library';
import { TapOptions } from 'tapable';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import {
  IHeftEventActions,
  CoreConfigFiles,
  HeftEvent,
  IHeftConfigurationRunScriptEventAction
} from '../utilities/CoreConfigFiles';
import { Async } from '../utilities/Async';
import {
  IBuildStageContext,
  IBundleSubstage,
  ICompileSubstage,
  IPostBuildSubstage,
  IPreCompileSubstage
} from '../stages/BuildStage';
import { ITestStageContext } from '../stages/TestStage';
import { Constants } from '../utilities/Constants';

const PLUGIN_NAME: string = 'RunScriptPlugin';
const HEFT_STAGE_TAP: TapOptions<'promise'> = {
  name: PLUGIN_NAME,
  stage: Number.MIN_SAFE_INTEGER
};

export interface IRunScriptOptions<TStageProperties> {
  terminal: Terminal;
  properties: TStageProperties;
  scriptOptions: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  heftConfiguration: HeftConfiguration;
}

export interface IRunScript<TStageProperties> {
  run?: (options: IRunScriptOptions<TStageProperties>) => void;
  runAsync?: (options: IRunScriptOptions<TStageProperties>) => Promise<void>;
}

export class RunScriptPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runScriptsForHeftEvent(
            HeftEvent.preCompile,
            build.properties,
            heftSession,
            heftConfiguration
          );
        });
      });

      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runScriptsForHeftEvent(
            HeftEvent.compile,
            build.properties,
            heftSession,
            heftConfiguration
          );
        });
      });

      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runScriptsForHeftEvent(
            HeftEvent.bundle,
            build.properties,
            heftSession,
            heftConfiguration
          );
        });
      });

      build.hooks.postBuild.tap(PLUGIN_NAME, (postBuild: IPostBuildSubstage) => {
        postBuild.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runScriptsForHeftEvent(
            HeftEvent.postBuild,
            build.properties,
            heftSession,
            heftConfiguration
          );
        });
      });
    });

    heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestStageContext) => {
      test.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
        await this._runScriptsForHeftEvent(HeftEvent.test, test.properties, heftSession, heftConfiguration);
      });
    });
  }

  private async _runScriptsForHeftEvent<TStageProperties>(
    heftEvent: HeftEvent,
    stageProperties: TStageProperties,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const logger: ScopedLogger = heftSession.requestScopedLogger('run-script');
    const eventActions: IHeftEventActions = await CoreConfigFiles.getConfigConfigFileEventActionsAsync(
      logger.terminal,
      heftConfiguration
    );

    const runScriptEventActions: IHeftConfigurationRunScriptEventAction[] =
      eventActions.runScript.get(heftEvent) || [];
    await Async.forEachLimitAsync(
      runScriptEventActions,
      Constants.maxParallelism,
      async (runScriptEventAction) => {
        // The scriptPath property should be fully resolved since it is included in the resolution logic used by
        // HeftConfiguration. We don't need to resolve it any further, though we will provide a usable logger
        // name by taking only the basename from the resolved path.
        const resolvedModulePath: string = runScriptEventAction.scriptPath;
        const scriptLogger: ScopedLogger = heftSession.requestScopedLogger(path.basename(resolvedModulePath));

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
          terminal: scriptLogger.terminal,
          properties: stageProperties,
          scriptOptions: runScriptEventAction.scriptOptions,
          heftConfiguration
        };
        if (runScript.run) {
          runScript.run(runScriptOptions);
        } else if (runScript.runAsync) {
          await runScript.runAsync(runScriptOptions);
        }
      }
    );
  }
}
