// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { MetricsCollector, MetricsCollectorHooks } from '../metrics/MetricsCollector';
import { ICleanStageContext } from '../stages/CleanStage';
import { IDevDeployStageContext } from '../stages/DevDeployStage';
import { IBuildStageContext } from '../stages/BuildStage';
import { ITestStageContext } from '../stages/TestStage';
import { IHeftPlugin } from './IHeftPlugin';
import { IInternalHeftSessionOptions } from './InternalHeftSession';

/**
 * @public
 */
export interface IHeftSessionHooks {
  build: SyncHook<IBuildStageContext>;
  clean: SyncHook<ICleanStageContext>;
  devDeploy: SyncHook<IDevDeployStageContext>;
  test: SyncHook<ITestStageContext>;
  metricsCollector: MetricsCollectorHooks;
}

export interface IHeftSessionOptions {
  plugin: IHeftPlugin;
}

/**
 * @public
 */
export class HeftSession {
  public readonly hooks: IHeftSessionHooks;

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  /**
   * If set to true, the build is running with the --debug flag
   */
  public readonly debugMode: boolean;

  /**
   * @internal
   */
  public constructor(options: IHeftSessionOptions, internalSessionOptions: IInternalHeftSessionOptions) {
    this.metricsCollector = internalSessionOptions.metricsCollector;

    this.hooks = {
      build: internalSessionOptions.buildStage.stageInitializationHook,
      clean: internalSessionOptions.cleanStage.stageInitializationHook,
      devDeploy: internalSessionOptions.devDeployStage.stageInitializationHook,
      test: internalSessionOptions.testStage.stageInitializationHook,
      metricsCollector: this.metricsCollector.hooks
    };

    this.debugMode = internalSessionOptions.getIsDebugMode();
  }
}
