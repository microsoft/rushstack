// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import { RushConstants } from '../RushConstants';

import type { CobuildConfiguration } from '../../api/CobuildConfiguration';
import type { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import type { OperationStatus } from '../operations/OperationStatus';
import type { ICobuildContext } from './ICobuildLockProvider';

export interface ICobuildLockOptions {
  cobuildConfiguration: CobuildConfiguration;
  projectBuildCache: ProjectBuildCache;
}

export interface ICobuildCompletedState {
  status: OperationStatus.Success | OperationStatus.SuccessWithWarning | OperationStatus.Failure;
  cacheId: string;
}

export class CobuildLock {
  public readonly projectBuildCache: ProjectBuildCache;
  public readonly cobuildConfiguration: CobuildConfiguration;

  private _cobuildContext: ICobuildContext;

  public constructor(options: ICobuildLockOptions) {
    const { cobuildConfiguration, projectBuildCache } = options;
    this.projectBuildCache = projectBuildCache;
    this.cobuildConfiguration = cobuildConfiguration;

    const { contextId } = cobuildConfiguration;
    const { cacheId } = projectBuildCache;

    if (!cacheId) {
      // This should never happen
      throw new InternalError(`Cache id is require for cobuild lock`);
    }

    this._cobuildContext = {
      contextId,
      cacheId,
      version: RushConstants.cobuildLockVersion
    };
  }

  public async setCompletedStateAsync(state: ICobuildCompletedState): Promise<void> {
    await this.cobuildConfiguration.cobuildLockProvider.setCompletedStateAsync(this._cobuildContext, state);
  }

  public async getCompletedStateAsync(): Promise<ICobuildCompletedState | undefined> {
    const state: ICobuildCompletedState | undefined =
      await this.cobuildConfiguration.cobuildLockProvider.getCompletedStateAsync(this._cobuildContext);
    return state;
  }

  public async tryAcquireLockAsync(): Promise<boolean> {
    const acquireLockResult: boolean = await this.cobuildConfiguration.cobuildLockProvider.acquireLockAsync(
      this._cobuildContext
    );
    return acquireLockResult;
  }

  public async renewLockAsync(): Promise<void> {
    await this.cobuildConfiguration.cobuildLockProvider.renewLockAsync(this._cobuildContext);
  }

  public get cobuildContext(): ICobuildContext {
    return this._cobuildContext;
  }
}
