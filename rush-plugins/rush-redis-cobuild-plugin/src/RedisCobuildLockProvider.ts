// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createClient } from '@redis/client';

import type { ICobuildLockProvider, ICobuildContext, ICobuildCompletedState } from '@rushstack/rush-sdk';
import type {
  RedisClientOptions,
  RedisClientType,
  RedisFunctions,
  RedisModules,
  RedisScripts
} from '@redis/client';

/**
 * The redis client options
 * @public
 */
export interface IRedisCobuildLockProviderOptions extends RedisClientOptions {}

const KEY_SEPARATOR: string = ':';
const COMPLETED_STATE_SEPARATOR: string = ';';

export class RedisCobuildLockProvider implements ICobuildLockProvider {
  private readonly _options: IRedisCobuildLockProviderOptions;

  private _redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
  private _lockKeyMap: WeakMap<ICobuildContext, string> = new WeakMap<ICobuildContext, string>();
  private _completedKeyMap: WeakMap<ICobuildContext, string> = new WeakMap<ICobuildContext, string>();

  public constructor(options: IRedisCobuildLockProviderOptions) {
    this._options = options;
    this._redisClient = createClient(this._options);
  }

  public async acquireLockAsync(context: ICobuildContext): Promise<boolean> {
    const { terminal } = context;
    const lockKey: string = this.getLockKey(context);
    const incrResult: number = await this._redisClient.incr(lockKey);
    const result: boolean = incrResult === 1;
    terminal.writeDebugLine(`Acquired lock for ${lockKey}: ${incrResult}, 1 is success`);
    if (result) {
      await this.renewLockAsync(context);
    }
    return result;
  }

  public async renewLockAsync(context: ICobuildContext): Promise<void> {
    const { terminal } = context;
    const lockKey: string = this.getLockKey(context);
    await this._redisClient.expire(lockKey, 30);
    terminal.writeDebugLine(`Renewed lock for ${lockKey}`);
  }

  public async releaseLockAsync(context: ICobuildContext): Promise<void> {
    const { terminal } = context;
    const lockKey: string = this.getLockKey(context);
    await this._redisClient.set(lockKey, 0);
    terminal.writeDebugLine(`Released lock for ${lockKey}`);
  }

  public async setCompletedStateAsync(
    context: ICobuildContext,
    state: ICobuildCompletedState
  ): Promise<void> {
    const { terminal } = context;
    const key: string = this.getCompletedStateKey(context);
    const value: string = this._serializeCompletedState(state);
    await this._redisClient.set(key, value);
    terminal.writeDebugLine(`Set completed state for ${key}: ${value}`);
  }

  public async getCompletedStateAsync(context: ICobuildContext): Promise<ICobuildCompletedState | undefined> {
    const key: string = this.getCompletedStateKey(context);
    let state: ICobuildCompletedState | undefined;
    const value: string | null = await this._redisClient.get(key);
    if (value) {
      state = this._deserializeCompletedState(value);
    }
    return state;
  }

  /**
   * Returns the lock key for the given context
   * Example: cobuild:v1:<contextId>:<cacheId>:lock
   */
  public getLockKey(context: ICobuildContext): string {
    const { version, contextId, cacheId } = context;
    let lockKey: string | undefined = this._lockKeyMap.get(context);
    if (!lockKey) {
      lockKey = ['cobuild', `v${version}`, contextId, cacheId, 'lock'].join(KEY_SEPARATOR);
      this._completedKeyMap.set(context, lockKey);
    }
    return lockKey;
  }

  /**
   * Returns the completed key for the given context
   * Example: cobuild:v1:<contextId>:<cacheId>:completed
   */
  public getCompletedStateKey(context: ICobuildContext): string {
    const { version, contextId, cacheId } = context;
    let completedKey: string | undefined = this._completedKeyMap.get(context);
    if (!completedKey) {
      completedKey = ['cobuild', `v${version}`, contextId, cacheId, 'completed'].join(KEY_SEPARATOR);
      this._completedKeyMap.set(context, completedKey);
    }
    return completedKey;
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
