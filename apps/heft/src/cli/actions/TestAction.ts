// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook, AsyncParallelHook, AsyncSeriesHook } from 'tapable';
import { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BuildAction, IBuildActionOptions, IBuildActionContext } from './BuildAction';
import { ActionHooksBase, IActionContext } from './HeftActionBase';

/**
 * @public
 */
export class TestHooks extends ActionHooksBase<ITestActionProperties> {
  public readonly run: AsyncParallelHook = new AsyncParallelHook();
  public readonly configureTest: AsyncSeriesHook = new AsyncSeriesHook();
}

/**
 * @public
 */
export interface ITestActionProperties {
  watchMode: boolean;
}

/**
 * @public
 */
export interface ITestActionContext extends IActionContext<TestHooks, ITestActionProperties> {}

export interface ITestActionOptions extends IBuildActionOptions {
  buildAction: BuildAction;
}

export class TestAction extends BuildAction {
  public testActionHook: SyncHook<ITestActionContext> = new SyncHook<ITestActionContext>(['action']);
  private _buildAction: BuildAction;

  private _noBuildFlag: CommandLineFlagParameter;

  public constructor(options: ITestActionOptions) {
    super(options, {
      actionName: 'test',
      summary: 'Build the project and run tests.',
      documentation: ''
    });

    this._buildAction = options.buildAction;
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._noBuildFlag = this.defineFlagParameter({
      parameterLongName: '--no-build',
      description: 'If provided, only run tests. Do not build first.'
    });
  }

  protected async actionExecute(buildActionContext: IBuildActionContext): Promise<void> {
    const testActionContext: ITestActionContext = {
      hooks: new TestHooks(),
      properties: {
        watchMode: buildActionContext.properties.watchMode
      }
    };
    const shouldBuild: boolean = !this._noBuildFlag.value;

    if (testActionContext.properties.watchMode) {
      if (!shouldBuild) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._noBuildFlag.longName}`);
      } else if (buildActionContext.properties.noTest) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._noTestFlag.longName}`);
      }
    }

    this.testActionHook.call(testActionContext);

    if (testActionContext.hooks.overrideAction.isUsed()) {
      await testActionContext.hooks.overrideAction.promise(buildActionContext.properties);
      return;
    }

    await testActionContext.hooks.loadActionConfiguration.promise();
    await testActionContext.hooks.afterLoadActionConfiguration.promise();

    if (testActionContext.properties.watchMode) {
      // In --watch mode, run all configuration upfront and then kick off all stages
      // concurrently with the expectation that the their promises will never resolve
      // and that they will handle watching filesystem changes

      this._buildAction.actionHook.call(buildActionContext);
      await testActionContext.hooks.configureTest.promise();

      await Promise.all([
        super.actionExecute(buildActionContext),
        this._runStageWithLogging('Test', testActionContext)
      ]);
    } else {
      if (shouldBuild) {
        // Run Build
        this._buildAction.actionHook.call(buildActionContext);
        await super.actionExecute(buildActionContext);
      }

      if (!buildActionContext.properties.noTest && !buildActionContext.properties.liteFlag) {
        await testActionContext.hooks.configureTest.promise();
        if (shouldBuild) {
          await this._runStageWithLogging('Test', testActionContext);
        } else {
          await testActionContext.hooks.run.promise();
        }
      }
    }
  }
}
