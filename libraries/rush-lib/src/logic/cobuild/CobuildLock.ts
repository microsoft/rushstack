// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../RushConstants';

import type { ITerminal } from '@rushstack/node-core-library';
import type { CobuildConfiguration } from '../../api/CobuildConfiguration';
import type { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import { OperationStatus } from '../operations/OperationStatus';

export interface ICobuildLockOptions {
  cobuildConfiguration: CobuildConfiguration;
  projectBuildCache: ProjectBuildCache;
  terminal: ITerminal;
}

export interface ICobuildCompletedState {
  status: OperationStatus.Success | OperationStatus.SuccessWithWarning | OperationStatus.Failure;
  cacheId: string;
}

const KEY_SEPARATOR: string = ':';
const COMPLETED_STATE_SEPARATOR: string = ';';

export class CobuildLock {
  public readonly options: ICobuildLockOptions;
  public readonly lockKey: string;
  public readonly completedKey: string;

  public readonly projectBuildCache: ProjectBuildCache;
  public readonly cobuildConfiguration: CobuildConfiguration;

  public constructor(options: ICobuildLockOptions) {
    this.options = options;
    const { cobuildConfiguration, projectBuildCache } = options;
    this.projectBuildCache = projectBuildCache;
    this.cobuildConfiguration = cobuildConfiguration;

    const { contextId } = cobuildConfiguration;
    const { cacheId } = projectBuildCache;
    // Example: cobuild:v1:<contextId>:<cacheId>:lock
    this.lockKey = ['cobuild', `v${RushConstants.cobuildLockVersion}`, contextId, cacheId, 'lock'].join(
      KEY_SEPARATOR
    );
    // Example: cobuild:v1:<contextId>:<cacheId>:completed
    this.completedKey = [
      'cobuild',
      `v${RushConstants.cobuildLockVersion}`,
      contextId,
      cacheId,
      'completed'
    ].join(KEY_SEPARATOR);
  }

  public async setCompletedStateAsync(state: ICobuildCompletedState): Promise<void> {
    const { terminal } = this.options;
    const serializedState: string = this._serializeCompletedState(state);
    terminal.writeDebugLine(`Set completed state by key ${this.completedKey}: ${serializedState}`);
    await this.cobuildConfiguration.cobuildLockProvider.setCompletedStateAsync({
      key: this.completedKey,
      value: serializedState,
      terminal
    });
  }

  public async getCompletedStateAsync(): Promise<ICobuildCompletedState | undefined> {
    const { terminal } = this.options;
    const state: string | undefined =
      await this.cobuildConfiguration.cobuildLockProvider.getCompletedStateAsync({
        key: this.completedKey,
        terminal
      });
    terminal.writeDebugLine(`Get completed state by key ${this.completedKey}: ${state}`);
    if (!state) {
      return;
    }
    return this._deserializeCompletedState(state);
  }

  public async tryAcquireLockAsync(): Promise<boolean> {
    const { terminal } = this.options;
    // const result: boolean = true;
    // const result: boolean = false;
    // const result: boolean = Math.random() > 0.5;
    const acquireLockResult: boolean = await this.cobuildConfiguration.cobuildLockProvider.acquireLockAsync({
      lockKey: this.lockKey,
      terminal
    });
    terminal.writeDebugLine(`Acquired lock for ${this.lockKey}, result: ${acquireLockResult}`);
    return acquireLockResult;
  }

  public async releaseLockAsync(): Promise<void> {
    const { terminal } = this.options;
    terminal.writeDebugLine(`Released lock for ${this.lockKey}`);
    return;
  }

  public async renewLockAsync(): Promise<void> {
    const { terminal } = this.options;
    terminal.writeDebugLine(`Renewed lock for ${this.lockKey}`);
    return;
  }

  private _serializeCompletedState(state: ICobuildCompletedState): string {
    // Example: SUCCESS;1234567890
    // Example: FAILURE;1234567890
    return `${state.status}${COMPLETED_STATE_SEPARATOR}${state.cacheId}`;
  }

  private _deserializeCompletedState(state: string): ICobuildCompletedState | undefined {
    const [status, cacheId] = state.split(COMPLETED_STATE_SEPARATOR);
    return { status: status as ICobuildCompletedState['status'], cacheId };
  }
}
