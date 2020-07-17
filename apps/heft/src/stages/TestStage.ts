// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StageBase, StageHooksBase, IStageContext } from './StageBase';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { AsyncSeriesHook, AsyncParallelHook } from 'tapable';

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
  production: boolean;
}

/**
 * @public
 */
export interface ITestStageContext extends IStageContext<TestStageHooks, ITestStageProperties> {}

export interface ITestStageOptions {
  watchMode: boolean;
  production: boolean;
}

export class TestStage extends StageBase<TestStageHooks, ITestStageProperties, ITestStageOptions> {
  public constructor(heftConfiguration: HeftConfiguration) {
    super(heftConfiguration, TestStageHooks);
  }

  protected getDefaultStageProperties(options: ITestStageOptions): ITestStageProperties {
    return {
      watchMode: options.watchMode,
      production: options.production
    };
  }

  protected async executeInnerAsync(): Promise<void> {
    await this.stageHooks.configureTest.promise();
    await this.stageHooks.run.promise();
  }
}
