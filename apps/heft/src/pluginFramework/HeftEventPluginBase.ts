// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TapOptions } from 'tapable';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import {
  CoreConfigFiles,
  HeftEvent,
  IHeftConfigurationJsonEventActionBase,
  IHeftEventActions
} from '../utilities/CoreConfigFiles';
import { ICleanStageContext, ICleanStageProperties } from '../stages/CleanStage';
import {
  IBuildStageContext,
  IBuildStageProperties,
  IBundleSubstage,
  ICompileSubstage,
  IPostBuildSubstage,
  IPreCompileSubstage
} from '../stages/BuildStage';
import { ITestStageContext, ITestStageProperties } from '../stages/TestStage';

export abstract class HeftEventPluginBase<THeftEventAction extends IHeftConfigurationJsonEventActionBase>
  implements IHeftPlugin
{
  public abstract readonly pluginName: string;
  protected abstract readonly eventActionName: keyof IHeftEventActions;
  protected abstract readonly loggerName: string;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const logger: ScopedLogger = heftSession.requestScopedLogger(this.loggerName);
    const heftStageTap: TapOptions<'promise'> = {
      name: this.pluginName,
      stage: Number.MAX_SAFE_INTEGER / 2 // This should give us some certainty that this will run after other plugins
    };

    const handleEventActionsAsync = async <TStageProperties>(
      heftEvent: HeftEvent,
      properties: TStageProperties,
      handler: (
        heftEvent: HeftEvent,
        heftEventActions: THeftEventAction[],
        logger: ScopedLogger,
        heftSession: HeftSession,
        heftConfiguration: HeftConfiguration,
        properties: TStageProperties
      ) => Promise<void>
    ): Promise<void> => {
      const heftEventActions: THeftEventAction[] = await this._getEventActions(
        heftEvent,
        logger,
        heftConfiguration
      );
      if (heftEventActions.length) {
        await handler(heftEvent, heftEventActions, logger, heftSession, heftConfiguration, properties);
      }
    };

    heftSession.hooks.clean.tap(this.pluginName, (clean: ICleanStageContext) => {
      clean.hooks.run.tapPromise(heftStageTap, async () => {
        await handleEventActionsAsync(
          HeftEvent.clean,
          clean.properties,
          this.handleCleanEventActionsAsync.bind(this)
        );
      });
    });

    heftSession.hooks.build.tap(this.pluginName, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(this.pluginName, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(heftStageTap, async () => {
          await handleEventActionsAsync(
            HeftEvent.preCompile,
            build.properties,
            this.handleBuildEventActionsAsync.bind(this)
          );
        });
      });

      build.hooks.compile.tap(this.pluginName, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(heftStageTap, async () => {
          await handleEventActionsAsync(
            HeftEvent.compile,
            build.properties,
            this.handleBuildEventActionsAsync.bind(this)
          );
        });
      });

      build.hooks.bundle.tap(this.pluginName, (bundle: IBundleSubstage) => {
        bundle.hooks.run.tapPromise(heftStageTap, async () => {
          await handleEventActionsAsync(
            HeftEvent.bundle,
            build.properties,
            this.handleBuildEventActionsAsync.bind(this)
          );
        });
      });

      build.hooks.postBuild.tap(this.pluginName, (postBuild: IPostBuildSubstage) => {
        postBuild.hooks.run.tapPromise(heftStageTap, async () => {
          await handleEventActionsAsync(
            HeftEvent.postBuild,
            build.properties,
            this.handleBuildEventActionsAsync.bind(this)
          );
        });
      });
    });

    heftSession.hooks.test.tap(this.pluginName, (test: ITestStageContext) => {
      test.hooks.run.tapPromise(heftStageTap, async () => {
        await handleEventActionsAsync(
          HeftEvent.test,
          test.properties,
          this.handleTestEventActionsAsync.bind(this)
        );
      });
    });
  }

  protected handleCleanEventActionsAsync(
    heftEvent: HeftEvent,
    heftEventActions: THeftEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: ICleanStageProperties
  ): Promise<void> {
    return Promise.resolve();
  }

  protected handleBuildEventActionsAsync(
    heftEvent: HeftEvent,
    heftEventActions: THeftEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: IBuildStageProperties
  ): Promise<void> {
    return Promise.resolve();
  }

  protected handleTestEventActionsAsync(
    heftEvent: HeftEvent,
    heftEventActions: THeftEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: ITestStageProperties
  ): Promise<void> {
    return Promise.resolve();
  }

  private async _getEventActions(
    heftEvent: HeftEvent,
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration
  ): Promise<THeftEventAction[]> {
    const allEventActions: IHeftEventActions = await CoreConfigFiles.getConfigConfigFileEventActionsAsync(
      logger.terminal,
      heftConfiguration
    );
    const baseEventActions: IHeftConfigurationJsonEventActionBase[] =
      allEventActions[this.eventActionName].get(heftEvent) || [];

    return baseEventActions as THeftEventAction[];
  }
}
