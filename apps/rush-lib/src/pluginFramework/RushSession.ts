// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, ITerminalProvider } from '@rushstack/node-core-library';
import { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import { CloudBuildCacheProviderBase } from '../logic/buildCache/CloudBuildCacheProviderBase';
import { Logger } from './logging/Logger';
import { IRushLifecycle, RushLifecycleHooks } from './RushLifeCycle';

/**
 * @public
 */
export interface IRushSessionOptions {
  terminalProvider: ITerminalProvider;
  getIsDebugMode: () => boolean;
}

/**
 * @public
 */
export class RushSession implements IRushLifecycle {
  private readonly _options: IRushSessionOptions;

  public readonly hooks: RushLifecycleHooks;

  public cloudCacheProviderFactories: Map<
    string,
    (buildCacheJson: IBuildCacheJson, buildCacheConfigFilePath: string) => CloudBuildCacheProviderBase
  > = new Map();

  public constructor(options: IRushSessionOptions) {
    this._options = options;

    this.hooks = new RushLifecycleHooks();
  }

  public getLogger(name: string): Logger {
    if (!name) {
      throw new InternalError('RushSession.getLogger(name) called without a name');
    }
    return new Logger({
      loggerName: name,
      getShouldPrintStacks: () => this._options.getIsDebugMode(),
      terminalProvider: this._options.terminalProvider
    });
  }
}
