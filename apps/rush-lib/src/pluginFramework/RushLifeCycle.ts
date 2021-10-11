// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook, SyncBailHook, SyncHook } from 'tapable';
import { ILogger, ILoggerOptions } from './logging/Logger';

/**
 * @public
 */
export interface IRushLifecycle {
  hooks: RushLifecycleHooks;
}

/**
 * @public
 */
export class RushLifecycleHooks {
  /**
   * The hook to run when all rush plugins is initialized.
   */
  public initialize: AsyncSeriesHook<void> = new AsyncSeriesHook<void>();
  /**
   * A hook to mutate options passed to logger
   */
  public loggerOptions: SyncHook<ILoggerOptions> = new SyncHook<ILoggerOptions>(['loggerOptions']);
  /**
   * A hook to specify a customize logger, which implements ILogger
   * NOTE: only the first tap which returns a non-null value will be used
   */
  public logger: SyncBailHook<ILoggerOptions, ILogger> = new SyncBailHook(['loggerOptions']);
}
