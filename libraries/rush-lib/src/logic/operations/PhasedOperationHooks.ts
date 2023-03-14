// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesWaterfallHook } from 'tapable';

import type { OperationExecutionRecord } from './OperationExecutionRecord';

/**
 * A plugin that interacts with a phased commands.
 * @alpha
 */
export interface IPhasedOperationPlugin {
  /**
   * Applies this plugin.
   */
  apply(hooks: PhasedOperationHooks): void;
}

/**
 * Hooks into the execution process for phased operation
 * @alpha
 */
export class PhasedOperationHooks {
  public beforeExecuteOperation: AsyncSeriesWaterfallHook<OperationExecutionRecord> =
    new AsyncSeriesWaterfallHook<OperationExecutionRecord>(['operation'], 'beforeExecuteOperation');

  public afterExecuteOperation: AsyncSeriesWaterfallHook<OperationExecutionRecord> =
    new AsyncSeriesWaterfallHook<OperationExecutionRecord>(['operation'], 'afterExecuteOperation');
}
