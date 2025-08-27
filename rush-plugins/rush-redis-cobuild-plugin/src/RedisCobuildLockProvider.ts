// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createClient } from '@redis/client';
import type {
  RedisClientOptions,
  RedisClientType,
  RedisFunctions,
  RedisModules,
  RedisScripts,
  TypeMapping
} from '@redis/client';

import type {
  ICobuildLockProvider,
  ICobuildContext,
  ICobuildCompletedState,
  RushSession
} from '@rushstack/rush-sdk';
import type { ITerminal } from '@rushstack/terminal';

/**
 * The redis client options
 * @beta
 */
export interface IRedisCobuildLockProviderOptions
  extends RedisClientOptions<RedisModules, RedisFunctions, RedisScripts, 2 | 3> {
  /**
   * The environment variable name for the redis password
   */
  passwordEnvironmentVariable?: string;
}

const COMPLETED_STATE_SEPARATOR: ';' = ';';

/**
 * @beta
 */
export class RedisCobuildLockProvider implements ICobuildLockProvider {
  private readonly _options: IRedisCobuildLockProviderOptions;
  private readonly _terminal: ITerminal;
  private readonly _lockKeyIdentifierMap: WeakMap<ICobuildContext, string> = new WeakMap<
    ICobuildContext,
    string
  >();
  private readonly _completedStateKeyIdentifierMap: WeakMap<ICobuildContext, string> = new WeakMap<
    ICobuildContext,
    string
  >();

  private readonly _redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts, 2 | 3>;

  public constructor(options: IRedisCobuildLockProviderOptions, rushSession: RushSession) {
    this._options = RedisCobuildLockProvider.expandOptionsWithEnvironmentVariables(options);
    this._terminal = rushSession.getLogger('RedisCobuildLockProvider').terminal;
    try {
      this._redisClient = createClient({
        ...this._options,
        socket: {
          reconnectStrategy: (count: number) => {
            this._terminal.writeErrorLine(`Redis client reconnecting attempt #${count}`);
            return count < 5 ? count * 1000 : false;
          }
        }
      });
    } catch (e) {
      throw new Error(`Failed to create redis client: ${e.message}`);
    }
  }

  public static expandOptionsWithEnvironmentVariables(
    options: IRedisCobuildLockProviderOptions,
    environment: NodeJS.ProcessEnv = process.env
  ): IRedisCobuildLockProviderOptions {
    const finalOptions: IRedisCobuildLockProviderOptions = { ...options };
    const missingEnvironmentVariables: Set<string> = new Set<string>();

    if (finalOptions.passwordEnvironmentVariable) {
      const password: string | undefined = environment[finalOptions.passwordEnvironmentVariable];
      if (password !== undefined) {
        finalOptions.password = password;
      } else {
        missingEnvironmentVariables.add(finalOptions.passwordEnvironmentVariable);
      }
      finalOptions.passwordEnvironmentVariable = undefined;
    }

    if (missingEnvironmentVariables.size) {
      throw new Error(
        `The "RedisCobuildLockProvider" tries to access missing environment variable${
          missingEnvironmentVariables.size > 1 ? 's' : ''
        }: ${Array.from(missingEnvironmentVariables).join(
          ', '
        )}\nPlease check the configuration in rush-redis-cobuild-plugin.json file`
      );
    }
    return finalOptions;
  }

  public async connectAsync(): Promise<void> {
    try {
      await this._redisClient.connect();
      // Check the connection works at early stage
      await this._redisClient.ping();
    } catch (e) {
      throw new Error(`Failed to connect to redis server: ${e.message}`);
    }

    // Register error event handler to avoid process exit when redis client error occurs.
    this._redisClient.on('error', (e: Error) => {
      if (e.message) {
        this._terminal.writeErrorLine(`Redis client error: ${e.message}`);
      } else {
        this._terminal.writeErrorLine(`Redis client error: ${e}`);
      }
    });
  }

  public async disconnectAsync(): Promise<void> {
    try {
      await this._redisClient.quit();
    } catch (e) {
      throw new Error(`Failed to disconnect to redis server: ${e.message}`);
    }
  }

  /**
   * Acquiring the lock based on the specific context.
   *
   * NOTE: this is a reentrant lock implementation
   */
  public async acquireLockAsync(context: ICobuildContext): Promise<boolean> {
    const { _terminal: terminal } = this;
    const { lockKey, lockExpireTimeInSeconds, runnerId } = context;
    let result: boolean = false;
    const lockKeyIdentifier: string = this._getLockKeyIdentifier(context);
    try {
      // According to the doc, the reply of set command is either "OK" or nil. The reply doesn't matter
      await this._redisClient.set(lockKey, runnerId, {
        NX: true,
        // call EXPIRE in an atomic command
        EX: lockExpireTimeInSeconds
        // Do not specify GET here since using NX ane GET together requires Redis@7.
      });
      // Just read the value by lock key to see wether it equals current runner id
      const value: string | null = await this._redisClient.get(lockKey);
      if (value === null) {
        // This should not happen.
        throw new Error(`Get redis key failed: ${lockKey}`);
      }
      result = value === runnerId;
      if (result) {
        terminal.writeDebugLine(
          `Successfully acquired ${lockKeyIdentifier} to runner(${runnerId}) and it expires in ${lockExpireTimeInSeconds}s`
        );
      } else {
        terminal.writeDebugLine(`Failed to acquire ${lockKeyIdentifier}, locked by runner ${value}`);
      }
    } catch (e) {
      throw new Error(`Error occurs when acquiring ${lockKeyIdentifier}: ${e.message}`);
    }
    return result;
  }

  public async renewLockAsync(context: ICobuildContext): Promise<void> {
    const { _terminal: terminal } = this;
    const { lockKey, lockExpireTimeInSeconds } = context;
    const lockKeyIdentifier: string = this._getLockKeyIdentifier(context);
    try {
      await this._redisClient.expire(lockKey, lockExpireTimeInSeconds);
    } catch (e) {
      throw new Error(`Failed to renew ${lockKeyIdentifier}: ${e.message}`);
    }
    terminal.writeDebugLine(`Renewed ${lockKeyIdentifier} expires in ${lockExpireTimeInSeconds} seconds`);
  }

  public async setCompletedStateAsync(
    context: ICobuildContext,
    state: ICobuildCompletedState
  ): Promise<void> {
    const { _terminal: terminal } = this;
    const { completedStateKey: key } = context;
    const value: string = this._serializeCompletedState(state);
    const completedStateKeyIdentifier: string = this._getCompletedStateKeyIdentifier(context);
    try {
      await this._redisClient.set(key, value);
    } catch (e) {
      throw new Error(`Failed to set ${completedStateKeyIdentifier}: ${e.message}`);
    }
    terminal.writeDebugLine(`Set ${completedStateKeyIdentifier}: ${value}`);
  }

  public async getCompletedStateAsync(context: ICobuildContext): Promise<ICobuildCompletedState | undefined> {
    const { _terminal: terminal } = this;
    const { completedStateKey: key } = context;
    const completedStateKeyIdentifier: string = this._getCompletedStateKeyIdentifier(context);
    let state: ICobuildCompletedState | undefined;
    try {
      const value: string | null = await this._redisClient.get(key);
      if (value) {
        state = this._deserializeCompletedState(value);
      }
      terminal.writeDebugLine(`Get ${completedStateKeyIdentifier}: ${value}`);
    } catch (e) {
      throw new Error(`Failed to get ${completedStateKeyIdentifier}: ${e.message}`);
    }
    return state;
  }

  private _serializeCompletedState(state: ICobuildCompletedState): string {
    // Example: SUCCESS;1234567890
    // Example: FAILURE;1234567890
    const { status, cacheId } = state;
    return [status, cacheId].join(COMPLETED_STATE_SEPARATOR);
  }

  private _deserializeCompletedState(state: string): ICobuildCompletedState | undefined {
    const [status, cacheId] = state.split(COMPLETED_STATE_SEPARATOR);
    return { status: status as ICobuildCompletedState['status'], cacheId };
  }

  private _getLockKeyIdentifier(context: ICobuildContext): string {
    let lockKeyIdentifier: string | undefined = this._lockKeyIdentifierMap.get(context);
    if (lockKeyIdentifier === undefined) {
      const { lockKey, packageName, phaseName } = context;
      lockKeyIdentifier = `lock(${lockKey})_package(${packageName})_phase(${phaseName})`;
      this._lockKeyIdentifierMap.set(context, lockKeyIdentifier);
    }
    return lockKeyIdentifier;
  }

  private _getCompletedStateKeyIdentifier(context: ICobuildContext): string {
    let completedStateKeyIdentifier: string | undefined = this._completedStateKeyIdentifierMap.get(context);
    if (completedStateKeyIdentifier === undefined) {
      const { completedStateKey, packageName, phaseName } = context;
      completedStateKeyIdentifier = `completed_state(${completedStateKey})_package(${packageName})_phase(${phaseName})`;
      this._completedStateKeyIdentifierMap.set(context, completedStateKeyIdentifier);
    }
    return completedStateKeyIdentifier;
  }
}
