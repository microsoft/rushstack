// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

import type { CobuildConfiguration } from '../../api/CobuildConfiguration.ts';
import type { OperationStatus } from '../operations/OperationStatus.ts';
import type { ICobuildContext } from './ICobuildLockProvider.ts';
import type { OperationBuildCache } from '../buildCache/OperationBuildCache.ts';

const KEY_SEPARATOR: ':' = ':';

export interface ICobuildLockOptions {
  /**
   * {@inheritdoc CobuildConfiguration}
   */
  cobuildConfiguration: CobuildConfiguration;
  /**
   * {@inheritdoc ICobuildContext.clusterId}
   */
  cobuildClusterId: string;
  /**
   * {@inheritdoc ICobuildContext.packageName}
   */
  packageName: string;
  /**
   * {@inheritdoc ICobuildContext.phaseName}
   */
  phaseName: string;
  operationBuildCache: OperationBuildCache;
  /**
   * The expire time of the lock in seconds.
   */
  lockExpireTimeInSeconds: number;
}

export interface ICobuildCompletedState {
  status: OperationStatus.Success | OperationStatus.SuccessWithWarning | OperationStatus.Failure;
  cacheId: string;
}

export class CobuildLock {
  public readonly cobuildConfiguration: CobuildConfiguration;
  public readonly operationBuildCache: OperationBuildCache;

  private _cobuildContext: ICobuildContext;

  public constructor(options: ICobuildLockOptions) {
    const {
      cobuildConfiguration,
      operationBuildCache,
      cobuildClusterId: clusterId,
      lockExpireTimeInSeconds,
      packageName,
      phaseName
    } = options;
    const { cobuildContextId: contextId, cobuildRunnerId: runnerId } = cobuildConfiguration;
    const { cacheId } = operationBuildCache;
    this.cobuildConfiguration = cobuildConfiguration;
    this.operationBuildCache = operationBuildCache;

    if (!cacheId) {
      // This should never happen
      throw new InternalError(`Cache id is require for cobuild lock`);
    }

    if (!contextId) {
      // This should never happen
      throw new InternalError(`Cobuild context id is require for cobuild lock`);
    }

    // Example: cobuild:lock:<contextId>:<clusterId>
    const lockKey: string = ['cobuild', 'lock', contextId, clusterId].join(KEY_SEPARATOR);

    // Example: cobuild:completed:<contextId>:<cacheId>
    const completedStateKey: string = ['cobuild', 'completed', contextId, cacheId].join(KEY_SEPARATOR);

    this._cobuildContext = {
      contextId,
      clusterId,
      runnerId,
      lockKey,
      completedStateKey,
      packageName,
      phaseName,
      lockExpireTimeInSeconds: lockExpireTimeInSeconds,
      cacheId
    };
  }

  public async setCompletedStateAsync(state: ICobuildCompletedState): Promise<void> {
    await this.cobuildConfiguration
      .getCobuildLockProvider()
      .setCompletedStateAsync(this._cobuildContext, state);
  }

  public async getCompletedStateAsync(): Promise<ICobuildCompletedState | undefined> {
    const state: ICobuildCompletedState | undefined = await this.cobuildConfiguration
      .getCobuildLockProvider()
      .getCompletedStateAsync(this._cobuildContext);
    return state;
  }

  public async tryAcquireLockAsync(): Promise<boolean> {
    const acquireLockResult: boolean = await this.cobuildConfiguration
      .getCobuildLockProvider()
      .acquireLockAsync(this._cobuildContext);
    if (acquireLockResult) {
      // renew the lock in a redundant way in case of losing the lock
      await this.renewLockAsync();
    }
    return acquireLockResult;
  }

  public async renewLockAsync(): Promise<void> {
    await this.cobuildConfiguration.getCobuildLockProvider().renewLockAsync(this._cobuildContext);
  }

  public get cobuildContext(): ICobuildContext {
    return this._cobuildContext;
  }
}
