// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createClient } from '@redis/client';

import type {
  ICobuildLockProvider,
  ICobuildContext,
  ICobuildCompletedState,
  RushSession
} from '@rushstack/rush-sdk';
import type {
  RedisClientOptions,
  RedisClientType,
  RedisFunctions,
  RedisModules,
  RedisScripts
} from '@redis/client';
import type { ITerminal } from '@rushstack/node-core-library';

/**
 * The redis client options
 * @beta
 */
export interface IRedisCobuildLockProviderOptions extends RedisClientOptions {}

const KEY_SEPARATOR: string = ':';
const COMPLETED_STATE_SEPARATOR: string = ';';

/**
 * @beta
 */
export class RedisCobuildLockProvider implements ICobuildLockProvider {
  private readonly _options: IRedisCobuildLockProviderOptions;
  private _terminal: ITerminal;

  private _redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
  private _lockKeyMap: WeakMap<ICobuildContext, string> = new WeakMap<ICobuildContext, string>();
  private _completedKeyMap: WeakMap<ICobuildContext, string> = new WeakMap<ICobuildContext, string>();

  public constructor(options: IRedisCobuildLockProviderOptions, rushSession: RushSession) {
    this._options = options;
    this._terminal = rushSession.getLogger('RedisCobuildLockProvider').terminal;
    try {
      this._redisClient = createClient(this._options);
    } catch (e) {
      throw new Error(`Failed to create redis client: ${e.message}`);
    }
  }

  public async connectAsync(): Promise<void> {
    try {
      await this._redisClient.connect();
      // Check the connection works at early stage
      await this._redisClient.ping();
    } catch (e) {
      throw new Error(`Failed to connect to redis server: ${e.message}`);
    }
  }

  public async disconnectAsync(): Promise<void> {
    try {
      await this._redisClient.disconnect();
    } catch (e) {
      throw new Error(`Failed to disconnect to redis server: ${e.message}`);
    }
  }

  public async acquireLockAsync(context: ICobuildContext): Promise<boolean> {
    const { _terminal: terminal } = this;
    const lockKey: string = this.getLockKey(context);
    let result: boolean = false;
    try {
      const incrResult: number = await this._redisClient.incr(lockKey);
      result = incrResult === 1;
      terminal.writeDebugLine(`Acquired lock for ${lockKey}: ${incrResult}, 1 is success`);
      if (result) {
        await this.renewLockAsync(context);
      }
    } catch (e) {
      throw new Error(`Failed to acquire lock for ${lockKey}: ${e.message}`);
    }
    return result;
  }

  public async renewLockAsync(context: ICobuildContext): Promise<void> {
    const { _terminal: terminal } = this;
    const lockKey: string = this.getLockKey(context);
    try {
      await this._redisClient.expire(lockKey, 30);
    } catch (e) {
      throw new Error(`Failed to renew lock for ${lockKey}: ${e.message}`);
    }
    terminal.writeDebugLine(`Renewed lock for ${lockKey}`);
  }

  public async setCompletedStateAsync(
    context: ICobuildContext,
    state: ICobuildCompletedState
  ): Promise<void> {
    const { _terminal: terminal } = this;
    const key: string = this.getCompletedStateKey(context);
    const value: string = this._serializeCompletedState(state);
    try {
      await this._redisClient.set(key, value);
    } catch (e) {
      throw new Error(`Failed to set completed state for ${key}: ${e.message}`);
    }
    terminal.writeDebugLine(`Set completed state for ${key}: ${value}`);
  }

  public async getCompletedStateAsync(context: ICobuildContext): Promise<ICobuildCompletedState | undefined> {
    const { _terminal: terminal } = this;
    const key: string = this.getCompletedStateKey(context);
    let state: ICobuildCompletedState | undefined;
    try {
      const value: string | null = await this._redisClient.get(key);
      if (value) {
        state = this._deserializeCompletedState(value);
      }
      terminal.writeDebugLine(`Get completed state for ${key}: ${value}`);
    } catch (e) {
      throw new Error(`Failed to get completed state for ${key}: ${e.message}`);
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
      this._lockKeyMap.set(context, lockKey);
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
