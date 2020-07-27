// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { MetricsCollector, MetricsCollectorHooks } from '../metrics/MetricsCollector';
import { ICleanStageContext, CleanStage } from '../stages/CleanStage';
import { IDevDeployStageContext, DevDeployStage } from '../stages/DevDeployStage';
import { BuildStage, IBuildStageContext } from '../stages/BuildStage';
import { ITestStageContext, TestStage } from '../stages/TestStage';

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

/**
 * @internal
 */
export interface IHeftSessionOptions {
  buildStage: BuildStage;
  cleanStage: CleanStage;
  devDeployStage: DevDeployStage;
  testStage: TestStage;

  metricsCollector: MetricsCollector;
  getIsDebugMode(): boolean;
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
  public get debugMode(): boolean {
    return this._options.getIsDebugMode();
  }

  private _options: IHeftSessionOptions;

  /**
   * @internal
   */
  public constructor(options: IHeftSessionOptions) {
    this._options = options;

    this.metricsCollector = options.metricsCollector;

    this.hooks = {
      build: options.buildStage.stageInitializationHook,
      clean: options.cleanStage.stageInitializationHook,
      devDeploy: options.devDeployStage.stageInitializationHook,
      test: options.testStage.stageInitializationHook,
      metricsCollector: this.metricsCollector.hooks
    };
  }
}
