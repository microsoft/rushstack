// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/node-core-library';
import type { OperationStatus } from '../operations/OperationStatus';

/**
 * @beta
 */
export interface ICobuildContext {
  contextId: string;
  cacheId: string;
  version: number;
  terminal: ITerminal;
}

/**
 * @beta
 */
export interface ICobuildCompletedState {
  status: OperationStatus.Success | OperationStatus.SuccessWithWarning | OperationStatus.Failure;
  /**
   * Completed state points to the cache id that was used to store the build cache.
   * Note: Cache failed builds in a separate cache id
   */
  cacheId: string;
}

/**
 * @beta
 */
export interface ICobuildLockProvider {
  acquireLockAsync(context: ICobuildContext): Promise<boolean>;
  renewLockAsync(context: ICobuildContext): Promise<void>;
  releaseLockAsync(context: ICobuildContext): Promise<void>;
  setCompletedStateAsync(context: ICobuildContext, state: ICobuildCompletedState): Promise<void>;
  getCompletedStateAsync(context: ICobuildContext): Promise<ICobuildCompletedState | undefined>;
}
