// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';
import { AsyncSeriesBailHook, SyncHook, AsyncSeriesHook } from 'tapable';
import { HeftConfiguration } from '../configuration/HeftConfiguration';

/**
 * @public
 */
export interface IStageContext<
  TStageHooks extends StageHooksBase<TStageProperties>,
  TStageProperties extends object
> {
  hooks: TStageHooks;
  properties: TStageProperties;
}

/**
 * @public
 */
export abstract class StageHooksBase<TActionProperties extends object> {
  /**
   * This hook allows the action's execution to be completely overridden. Only the last-registered plugin
   * with an override hook provided applies.
   *
   * @beta
   */
  public readonly overrideStage: AsyncSeriesBailHook<TActionProperties> = new AsyncSeriesBailHook([
    'actionProperties'
  ]);

  public readonly loadStageConfiguration: AsyncSeriesHook = new AsyncSeriesHook();

  public readonly afterLoadStageConfiguration: AsyncSeriesHook = new AsyncSeriesHook();
}

export abstract class StageBase<
  TStageHooks extends StageHooksBase<TStageProperties>,
  TStageProperties extends object,
  TStageOptions
> {
  public readonly stageInitializationHook: SyncHook<IStageContext<TStageHooks, TStageProperties>>;
  protected readonly heftConfiguration: HeftConfiguration;
  protected readonly terminal: Terminal;
  protected stageOptions: TStageOptions;
  protected stageProperties: TStageProperties;
  protected stageHooks: TStageHooks;
  private readonly _innerHooksType: new () => TStageHooks;

  public constructor(heftConfiguration: HeftConfiguration, innerHooksType: new () => TStageHooks) {
    this.terminal = heftConfiguration.terminal;
    this.heftConfiguration = heftConfiguration;
    this.stageInitializationHook = new SyncHook<IStageContext<TStageHooks, TStageProperties>>([
      'stageContext'
    ]);
    this._innerHooksType = innerHooksType;
  }

  public async initializeAsync(stageOptions: TStageOptions): Promise<void> {
    this.stageOptions = stageOptions;
    this.stageProperties = this.getDefaultStageProperties(this.stageOptions);
    this.stageHooks = new this._innerHooksType();
    const stageContext: IStageContext<TStageHooks, TStageProperties> = {
      hooks: this.stageHooks,
      properties: this.stageProperties
    };

    this.stageInitializationHook.call(stageContext);

    await this.stageHooks.loadStageConfiguration.promise();
    await this.stageHooks.afterLoadStageConfiguration.promise();
  }

  public async executeAsync(): Promise<void> {
    if (this.stageHooks.overrideStage.isUsed()) {
      await this.stageHooks.overrideStage.promise(this.stageProperties);
    } else {
      await this.executeInnerAsync();
    }
  }

  protected abstract getDefaultStageProperties(options: TStageOptions): TStageProperties;

  protected abstract executeInnerAsync(): Promise<void>;
}
