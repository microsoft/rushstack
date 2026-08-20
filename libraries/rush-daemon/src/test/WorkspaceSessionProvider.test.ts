// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IWorkspaceSession, IWorkspaceSessionOptions } from '../WorkspaceSession';
import { WorkspaceSessionProvider } from '../WorkspaceSessionProvider';
import { TestWorkspaceSession } from './TestWorkspaceSession';

const OPTIONS: IWorkspaceSessionOptions = {
  repoRoot: 'repo',
  rushVersion: '5.178.0'
};

describe(WorkspaceSessionProvider.name, () => {
  it('shares concurrent initialization and reuses the result', async () => {
    const session: IWorkspaceSession = new TestWorkspaceSession(OPTIONS.repoRoot);
    let resolveFactory: ((value: IWorkspaceSession) => void) | undefined;
    let factoryCalls: number = 0;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(() => {
      factoryCalls++;
      return new Promise<IWorkspaceSession>((resolve) => {
        resolveFactory = resolve;
      });
    }, OPTIONS);

    const first: Promise<IWorkspaceSession> = provider.getSessionAsync();
    const second: Promise<IWorkspaceSession> = provider.getSessionAsync();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(factoryCalls).toBe(1);

    resolveFactory?.(session);
    await expect(first).resolves.toBe(session);
    await expect(provider.getSessionAsync()).resolves.toBe(session);
    expect(factoryCalls).toBe(1);
    await provider[Symbol.asyncDispose]();
  });

  it('clears a failed initialization so a later attempt can retry', async () => {
    const session: IWorkspaceSession = new TestWorkspaceSession(OPTIONS.repoRoot);
    let factoryCalls: number = 0;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(() => {
      factoryCalls++;
      return factoryCalls === 1
        ? Promise.reject(new Error('initialization failed'))
        : Promise.resolve(session);
    }, OPTIONS);

    await expect(provider.getSessionAsync()).rejects.toThrow('initialization failed');
    await expect(provider.getSessionAsync()).resolves.toBe(session);
    expect(factoryCalls).toBe(2);
    await provider[Symbol.asyncDispose]();
  });

  it('clears a synchronously thrown initialization so a later attempt can retry', async () => {
    const session: IWorkspaceSession = new TestWorkspaceSession(OPTIONS.repoRoot);
    let factoryCalls: number = 0;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(() => {
      factoryCalls++;
      if (factoryCalls === 1) {
        throw new Error('synchronous initialization failed');
      }
      return Promise.resolve(session);
    }, OPTIONS);

    await expect(provider.getSessionAsync()).rejects.toThrow('synchronous initialization failed');
    await expect(provider.getSessionAsync()).resolves.toBe(session);
    expect(factoryCalls).toBe(2);
    await provider[Symbol.asyncDispose]();
  });

  it('disposes a session that finishes initializing during shutdown', async () => {
    const disposalEvents: string[] = [];
    const session: IWorkspaceSession = new TestWorkspaceSession(OPTIONS.repoRoot, () =>
      disposalEvents.push('session')
    );
    let resolveFactory: ((value: IWorkspaceSession) => void) | undefined;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(
      () =>
        new Promise<IWorkspaceSession>((resolve) => {
          resolveFactory = resolve;
        }),
      OPTIONS
    );

    const initialization: Promise<IWorkspaceSession> = provider.getSessionAsync();
    const disposal: Promise<void> = provider[Symbol.asyncDispose]();
    await Promise.resolve();
    resolveFactory?.(session);

    await expect(initialization).rejects.toThrow('disposed during initialization');
    await disposal;
    expect(disposalEvents).toEqual(['session']);
  });

  it('surfaces a disposal failure from a session that finishes initializing during shutdown', async () => {
    const session: IWorkspaceSession = new TestWorkspaceSession(OPTIONS.repoRoot, () =>
      Promise.reject(new Error('session cleanup failed'))
    );
    let resolveFactory: ((value: IWorkspaceSession) => void) | undefined;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(
      () =>
        new Promise<IWorkspaceSession>((resolve) => {
          resolveFactory = resolve;
        }),
      OPTIONS
    );

    const initialization: Promise<IWorkspaceSession> = provider.getSessionAsync();
    const disposal: Promise<void> = provider[Symbol.asyncDispose]();
    const initializationExpectation: Promise<void> = expect(initialization).rejects.toThrow(
      'session cleanup failed'
    );
    const disposalExpectation: Promise<void> = expect(disposal).rejects.toThrow(
      'session cleanup failed'
    );
    await Promise.resolve();
    resolveFactory?.(session);

    await Promise.all([initializationExpectation, disposalExpectation]);
  });

  it('surfaces a synchronous disposal failure during initialization shutdown', async () => {
    const session: IWorkspaceSession = new TestWorkspaceSession(OPTIONS.repoRoot, () => {
      throw new Error('synchronous session cleanup failed');
    });
    let resolveFactory: ((value: IWorkspaceSession) => void) | undefined;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(
      () =>
        new Promise<IWorkspaceSession>((resolve) => {
          resolveFactory = resolve;
        }),
      OPTIONS
    );

    const initialization: Promise<IWorkspaceSession> = provider.getSessionAsync();
    const disposal: Promise<void> = provider[Symbol.asyncDispose]();
    const initializationExpectation: Promise<void> = expect(initialization).rejects.toThrow(
      'synchronous session cleanup failed'
    );
    const disposalExpectation: Promise<void> = expect(disposal).rejects.toThrow(
      'synchronous session cleanup failed'
    );
    await Promise.resolve();
    resolveFactory?.(session);

    await Promise.all([initializationExpectation, disposalExpectation]);
  });
});
