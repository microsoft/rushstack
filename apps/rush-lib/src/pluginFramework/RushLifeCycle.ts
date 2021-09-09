// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook } from 'tapable';

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
  public initialize: AsyncParallelHook<void> = new AsyncParallelHook<void>();
}
