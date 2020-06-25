// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { BuildAction, IBuildActionData } from '../cli/actions/BuildAction';
import { CleanAction, ICleanActionData } from '../cli/actions/CleanAction';
import { DevDeployAction, IDevDeployActionData } from '../cli/actions/DevDeployAction';
import { StartAction, IStartActionData } from '../cli/actions/StartAction';
import { TestAction, ITestActionData } from '../cli/actions/TestAction';
import { MetricsCollector, MetricsCollectorHooks } from '../metrics/MetricsCollector';

/**
 * @public
 */
export type Build = IBuildActionData;

/**
 * @public
 */
export type Clean = ICleanActionData;

/**
 * @public
 */
export type DevDeploy = IDevDeployActionData;

/**
 * @public
 */
export type Start = IStartActionData;

/**
 * @public
 */
export type Test = ITestActionData;

/**
 * @public
 */
export interface IHeftSessionHooks {
  build: SyncHook<IBuildActionData>;
  clean: SyncHook<ICleanActionData>;
  devDeploy: SyncHook<IDevDeployActionData>;
  start: SyncHook<IStartActionData>;
  test: SyncHook<ITestActionData>;
  metricsCollector: MetricsCollectorHooks;
}

/**
 * @internal
 */
export interface IHeftSessionOptions {
  buildAction: BuildAction;
  cleanAction: CleanAction;
  devDeployAction: DevDeployAction;
  startAction: StartAction;
  testAction: TestAction;

  metricsCollector: MetricsCollector;
  getIsDebugMode(): boolean;
}

/**
 * @public
 */
export class HeftSession {
  public readonly hooks: IHeftSessionHooks;

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
    const { buildAction, cleanAction, devDeployAction, startAction, testAction, metricsCollector } = options;

    this.hooks = {
      build: buildAction.actionHook,
      clean: cleanAction.actionHook,
      devDeploy: devDeployAction.actionHook,
      start: startAction.actionHook,
      test: testAction.testActionHook,
      metricsCollector: metricsCollector.hooks
    };
  }
}
