// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider } from '@rushstack/terminal';
import * as redisAPI from '@redis/client';
import type { RedisClientType } from '@redis/client';

import {
  type ICobuildCompletedState,
  type ICobuildContext,
  OperationStatus,
  RushSession
} from '@rushstack/rush-sdk';
import { type IRedisCobuildLockProviderOptions, RedisCobuildLockProvider } from '../RedisCobuildLockProvider';

const rushSession: RushSession = new RushSession({
  terminalProvider: new ConsoleTerminalProvider(),
  getIsDebugMode: () => false
});

describe(RedisCobuildLockProvider.name, () => {
  let storage: Record<string, string> = {};
  beforeEach(() => {
    jest.spyOn(redisAPI, 'createClient').mockImplementation(() => {
      return {
        expire: jest.fn().mockResolvedValue(undefined),
        set: jest
          .fn()
          .mockImplementation((key: string, value: string, options?: { NX?: boolean; GET?: boolean }) => {
            // https://redis.io/commands/set/
            const oldValue: string | undefined = storage[key];
            const { NX, GET } = options || {};
            let didSet: boolean = false;
            if (NX) {
              if (!storage[key]) {
                storage[key] = value;
                didSet = true;
              }
            } else {
              storage[key] = value;
              didSet = true;
            }

            if (GET) {
              if (oldValue === undefined) {
                return null;
              } else {
                return oldValue;
              }
            } else {
              if (didSet) {
                return 'OK';
              } else {
                return null;
              }
            }
          }),
        get: jest.fn().mockImplementation((key: string) => {
          return storage[key];
        })
      } as unknown as RedisClientType;
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    storage = {};
  });

  function prepareSubject(): RedisCobuildLockProvider {
    return new RedisCobuildLockProvider({} as IRedisCobuildLockProviderOptions, rushSession);
  }

  const context: ICobuildContext = {
    contextId: 'context_id',
    cacheId: 'cache_id',
    lockKey: 'lock_key',
    lockExpireTimeInSeconds: 30,
    completedStateKey: 'completed_state_key',
    clusterId: 'cluster_id',
    runnerId: 'runner_id',
    packageName: 'package_name',
    phaseName: 'phase_name'
  };

  it('expands options with environment variables', () => {
    const expectedOptions = {
      password: 'redis123' // [SuppressMessage("Microsoft.Security", "CS001:SecretInline", Justification="Password used in unit test.")]
    };
    const actualOptions = RedisCobuildLockProvider.expandOptionsWithEnvironmentVariables(
      {
        passwordEnvironmentVariable: 'REDIS_PASS'
      },
      {
        REDIS_PASS: 'redis123'
      }
    );
    expect(actualOptions).toEqual(expectedOptions);
  });

  it('throws error with missing environment variables', () => {
    expect(() => {
      RedisCobuildLockProvider.expandOptionsWithEnvironmentVariables(
        {
          passwordEnvironmentVariable: 'REDIS_PASS'
        },
        {}
      );
    }).toThrowErrorMatchingSnapshot();
  });

  it('acquires lock success', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const result: boolean = await subject.acquireLockAsync(context);
    expect(result).toBe(true);
  });

  it('acquires lock is a reentrant lock', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const result1: boolean = await subject.acquireLockAsync(context);
    expect(result1).toBe(true);
    const result2: boolean = await subject.acquireLockAsync(context);
    expect(result2).toBe(true);
  });

  it('acquires lock fails with a different runner', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const result1: boolean = await subject.acquireLockAsync(context);
    expect(result1).toBe(true);
    const cobuildContext: ICobuildContext = {
      ...context,
      runnerId: 'other_runner_id'
    };
    const result2: boolean = await subject.acquireLockAsync(cobuildContext);
    expect(result2).toBe(false);
  });

  it('set and get completedState works', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const cacheId: string = 'foo';
    const status: ICobuildCompletedState['status'] = OperationStatus.SuccessWithWarning;
    expect(() => subject.setCompletedStateAsync(context, { status, cacheId })).not.toThrowError();
    const actualState: ICobuildCompletedState | undefined = await subject.getCompletedStateAsync(context);
    expect(actualState?.cacheId).toBe(cacheId);
    expect(actualState?.status).toBe(status);
  });
});
