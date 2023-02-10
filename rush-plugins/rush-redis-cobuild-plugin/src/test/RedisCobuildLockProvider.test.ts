/* eslint-disable @typescript-eslint/no-floating-promises */
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ConsoleTerminalProvider } from '@rushstack/node-core-library';
import { ICobuildCompletedState, ICobuildContext, OperationStatus } from '@rushstack/rush-sdk';
import { IRedisCobuildLockProviderOptions, RedisCobuildLockProvider } from '../RedisCobuildLockProvider';

import * as redisAPI from '@redis/client';
import type { RedisClientType } from '@redis/client';

const terminal = new Terminal(new ConsoleTerminalProvider());

describe(RedisCobuildLockProvider.name, () => {
  let storage: Record<string, string | number> = {};
  beforeEach(() => {
    jest.spyOn(redisAPI, 'createClient').mockImplementation(() => {
      return {
        incr: jest.fn().mockImplementation((key: string) => {
          storage[key] = (Number(storage[key]) || 0) + 1;
          return storage[key];
        }),
        expire: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockImplementation((key: string, value: string) => {
          storage[key] = value;
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
    return new RedisCobuildLockProvider({} as IRedisCobuildLockProviderOptions);
  }
  const context: ICobuildContext = {
    contextId: '123',
    cacheId: 'abc',
    version: 1,
    terminal
  };

  it('getLockKey works', () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const lockKey: string = subject.getLockKey(context);
    expect(lockKey).toMatchSnapshot();
  });

  it('getCompletedStateKey works', () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const completedStateKey: string = subject.getCompletedStateKey(context);
    expect(completedStateKey).toMatchSnapshot();
  });

  it('acquires lock success', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const result: boolean = await subject.acquireLockAsync(context);
    expect(result).toBe(true);
  });

  it('acquires lock fails at the second time', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    const cobuildContext: ICobuildContext = {
      ...context,
      contextId: 'abc'
    };
    const result1: boolean = await subject.acquireLockAsync(cobuildContext);
    expect(result1).toBe(true);
    const result2: boolean = await subject.acquireLockAsync(cobuildContext);
    expect(result2).toBe(false);
  });

  it('releaseLockAsync works', async () => {
    const subject: RedisCobuildLockProvider = prepareSubject();
    expect(() => subject.releaseLockAsync(context)).not.toThrowError();
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
