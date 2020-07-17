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
  public buildStage: BuildStage;

  /**
   * @internal
   */
  public cleanStage: CleanStage;

  /**
   * @internal
   */
  public devDeployStage: DevDeployStage;

  /**
   * @internal
   */
  public testStage: TestStage;

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

    this.buildStage = options.buildStage;
    this.cleanStage = options.cleanStage;
    this.devDeployStage = options.devDeployStage;
    this.testStage = options.testStage;

    this.metricsCollector = options.metricsCollector;

    this.hooks = {
      build: this.buildStage.stageInitializationHook,
      clean: this.cleanStage.stageInitializationHook,
      devDeploy: this.devDeployStage.stageInitializationHook,
      test: this.testStage.stageInitializationHook,
      metricsCollector: this.metricsCollector.hooks
    };
  }
}
