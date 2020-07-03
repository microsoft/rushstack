// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { BuildAction, IBuildActionContext } from '../cli/actions/BuildAction';
import { CleanAction, ICleanActionContext } from '../cli/actions/CleanAction';
import { DevDeployAction, IDevDeployActionContext } from '../cli/actions/DevDeployAction';
import { StartAction, IStartActionContext } from '../cli/actions/StartAction';
import { TestAction, ITestActionContext } from '../cli/actions/TestAction';
import { MetricsCollector, MetricsCollectorHooks } from '../metrics/MetricsCollector';

/**
 * @public
 */
export interface IHeftSessionHooks {
  build: SyncHook<IBuildActionContext>;
  clean: SyncHook<ICleanActionContext>;
  devDeploy: SyncHook<IDevDeployActionContext>;
  start: SyncHook<IStartActionContext>;
  test: SyncHook<ITestActionContext>;
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
