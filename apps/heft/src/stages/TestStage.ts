// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StageBase, StageHooksBase, IStageContext } from './StageBase';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { AsyncSeriesHook, AsyncParallelHook } from 'tapable';
import { LoggingManager } from '../pluginFramework/logging/LoggingManager';

/**
 * @public
 */
export class TestStageHooks extends StageHooksBase<ITestStageProperties> {
  public readonly run: AsyncParallelHook = new AsyncParallelHook();
  public readonly configureTest: AsyncSeriesHook = new AsyncSeriesHook();
}

/**
 * @public
 */
export interface ITestStageProperties {
  watchMode: boolean;
}

/**
 * @public
 */
export interface ITestStageContext extends IStageContext<TestStageHooks, ITestStageProperties> {}

export interface ITestStageOptions {
  watchMode: boolean;
}

export class TestStage extends StageBase<TestStageHooks, ITestStageProperties, ITestStageOptions> {
  public constructor(heftConfiguration: HeftConfiguration, loggingManager: LoggingManager) {
    super(heftConfiguration, loggingManager, TestStageHooks);
  }

  protected async getDefaultStagePropertiesAsync(options: ITestStageOptions): Promise<ITestStageProperties> {
    return {
      watchMode: options.watchMode
    };
  }

  protected async executeInnerAsync(): Promise<void> {
    await this.stageHooks.configureTest.promise();
    await this.stageHooks.run.promise();
  }
}
