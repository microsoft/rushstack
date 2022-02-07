// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import { Operation } from '../logic/operations/Operation';

/**
 * Hooks usable by rush plugins to modify the behavior of a phased script action.
 * @beta
 */
export class PhasedScriptActionHooks {
  /**
   * The hook to run after the initial run completes.
   */
  public afterRun: AsyncSeriesHook<void> = new AsyncSeriesHook<void>(undefined, 'afterRun');
  /**
   * The hook to run after a watch-mode run completes.
   */
  public afterWatchRun: AsyncSeriesHook<void> = new AsyncSeriesHook<void>(undefined, 'afterWatchRun');
  /**
   * The hook to run after calculating the set of operations to include but before executing them for the initial run.
   * Allows a plugin to modify the execution graph.
   */
  public prepareOperations: AsyncSeriesWaterfallHook<Set<Operation>> = new AsyncSeriesWaterfallHook<
    Set<Operation>
  >(['operations'], 'prepareOperations');
  /**
   * The hook to run after calculating the set of operations to include but before executing them for a watch-mode run.
   * Allows a plugin to modify the execution graph.
   */
  public prepareWatchOperations: AsyncSeriesWaterfallHook<Set<Operation>> = new AsyncSeriesWaterfallHook<
    Set<Operation>
  >(['operations'], 'prepareWatchOperations');
}
