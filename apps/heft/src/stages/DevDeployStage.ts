// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StageBase, StageHooksBase, IStageContext } from './StageBase';
import { HeftConfiguration } from '../configuration/HeftConfiguration';

/**
 * @public
 */
export interface IDevDeployStageProperties {}

/**
 * @public
 */
export class DevDeployStageHooks extends StageHooksBase<IDevDeployStageProperties> {}

/**
 * @public
 */
export interface IDevDeployStageContext
  extends IStageContext<DevDeployStageHooks, IDevDeployStageProperties> {}

export interface IDevDeployStageOptions {}

export class DevDeployStage extends StageBase<
  DevDeployStageHooks,
  IDevDeployStageProperties,
  IDevDeployStageOptions
> {
  public constructor(heftConfiguration: HeftConfiguration) {
    super(heftConfiguration, DevDeployStageHooks);
  }

  protected getDefaultStageProperties(options: IDevDeployStageOptions): IDevDeployStageProperties {
    return {};
  }

  protected async executeInnerAsync(): Promise<void> {
    this.terminal.writeLine('dev-deploy has not been implemented yet');
  }
}
