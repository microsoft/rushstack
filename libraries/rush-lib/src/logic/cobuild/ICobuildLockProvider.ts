// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from '../operations/OperationStatus.ts';

/**
 * @beta
 */
export interface ICobuildContext {
  /**
   * The key for acquiring lock.
   */
  lockKey: string;
  /**
   * The expire time of the lock in seconds.
   */
  lockExpireTimeInSeconds: number;
  /**
   * The key for storing completed state.
   */
  completedStateKey: string;
  /**
   * The contextId is provided by the monorepo maintainer, it reads from environment variable {@link EnvironmentVariableNames.RUSH_COBUILD_CONTEXT_ID}.
   * It ensure only the builds from the same given contextId cooperated.
   */
  contextId: string;
  /**
   * The id of the cluster. The operations in the same cluster share the same clusterId and
   * will be executed on the same machine.
   */
  clusterId: string;
  /**
   * The id of the runner. The identifier for the running machine.
   *
   * It can be specified via assigning `RUSH_COBUILD_RUNNER_ID` environment variable.
   */
  runnerId: string;
  /**
   * The id of the cache entry. It should be kept the same as the normal cacheId from ProjectBuildCache.
   * Otherwise, there is a discrepancy in the success case wherein turning on cobuilds will
   * fail to populate the normal build cache.
   */
  cacheId: string;
  /**
   * The name of NPM package
   *
   * Example: `@scope/MyProject`
   */
  packageName: string;
  /**
   * The name of the phase.
   *
   * Example: _phase:build
   */
  phaseName: string;
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
  /**
   * The callback function invoked to connect to the lock provider.
   * For example, initializing the connection to the redis server.
   */
  connectAsync(): Promise<void>;
  /**
   * The callback function invoked to disconnect the lock provider.
   */
  disconnectAsync(): Promise<void>;
  /**
   * The callback function to acquire a lock with a lock key and specific contexts.
   *
   * NOTE: This lock implementation must be a ReentrantLock. It says the lock might be acquired
   * multiple times, since tasks in the same cluster can be run in the same VM.
   */
  acquireLockAsync(context: Readonly<ICobuildContext>): Promise<boolean>;
  /**
   * The callback function to renew a lock with a lock key and specific contexts.
   *
   * NOTE: If the lock key expired
   */
  renewLockAsync(context: Readonly<ICobuildContext>): Promise<void>;
  /**
   * The callback function to set completed state.
   */
  setCompletedStateAsync(context: Readonly<ICobuildContext>, state: ICobuildCompletedState): Promise<void>;
  /**
   * The callback function to get completed state.
   */
  getCompletedStateAsync(context: Readonly<ICobuildContext>): Promise<ICobuildCompletedState | undefined>;
}
