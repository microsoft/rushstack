// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook } from 'tapable';

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
}
