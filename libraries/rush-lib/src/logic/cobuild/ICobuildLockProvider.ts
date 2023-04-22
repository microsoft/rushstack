// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from '../operations/OperationStatus';

/**
 * @beta
 */
export interface ICobuildContext {
  /**
   * The contextId is provided by the monorepo maintainer, it reads from environment variable {@link EnvironmentVariableNames.RUSH_COBUILD_CONTEXT_ID}.
   * It ensure only the builds from the same given contextId cooperated. If user was more permissive,
   * and wanted all PR and CI builds building anything with the same contextId to cooperate, then just
   * set it to a static value.
   */
  contextId: string;
  /**
   * The id of cache. It should be keep same as the normal cacheId from ProjectBuildCache.
   * Otherwise, there is a discrepancy in the success case then turning on cobuilds will
   * fail to populate the normal build cache.
   */
  cacheId: string;
  /**
   * {@inheritdoc RushConstants.cobuildLockVersion}
   */
  version: number;
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
  connectAsync(): Promise<void>;
  disconnectAsync(): Promise<void>;
  acquireLockAsync(context: ICobuildContext): Promise<boolean>;
  renewLockAsync(context: ICobuildContext): Promise<void>;
  setCompletedStateAsync(context: ICobuildContext, state: ICobuildCompletedState): Promise<void>;
  getCompletedStateAsync(context: ICobuildContext): Promise<ICobuildCompletedState | undefined>;
}
