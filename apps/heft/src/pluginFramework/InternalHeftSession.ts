// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IHeftPlugin } from './IHeftPlugin';
import { HeftSession } from './HeftSession';
import { BuildStage } from '../stages/BuildStage';
import { CleanStage } from '../stages/CleanStage';
import { DevDeployStage } from '../stages/DevDeployStage';
import { TestStage } from '../stages/TestStage';
import { MetricsCollector } from '../metrics/MetricsCollector';

/**
 * @internal
 */
export interface IInternalHeftSessionOptions {
  buildStage: BuildStage;
  cleanStage: CleanStage;
  devDeployStage: DevDeployStage;
  testStage: TestStage;

  metricsCollector: MetricsCollector;
  getIsDebugMode(): boolean;
}

/**
 * @internal
 */
export class InternalHeftSession {
  private _options: IInternalHeftSessionOptions;

  public constructor(options: IInternalHeftSessionOptions) {
    this._options = options;
  }

  public getSessionForPlugin(thisPlugin: IHeftPlugin): HeftSession {
    return new HeftSession({ plugin: thisPlugin }, this._options);
  }
}
