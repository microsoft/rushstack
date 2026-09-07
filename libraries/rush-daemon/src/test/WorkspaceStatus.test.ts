// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceSessionProvider } from '../WorkspaceSessionProvider';
import { getWorkspaceStatus } from '../WorkspaceStatus';
import { createDeferred } from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

it('reads provider generation/token without starting or awaiting cold initialization', async () => {
  const ready = createDeferred<TestWorkspaceSession>();
  const factory = jest.fn(() => ready.promise);
  const provider = new WorkspaceSessionProvider(factory, { repoRoot: 'repo', rushVersion: '5.178.0' });
  expect(getWorkspaceStatus(provider)).toEqual({
    generation: 1,
    generationToken: undefined,
    graphInitialized: false,
    warmSet: undefined
  });
  expect(factory).not.toHaveBeenCalled();
  const initializing = provider.getSessionAsync();
  expect(getWorkspaceStatus(provider).generationToken).toBeUndefined();
  ready.resolve(new TestWorkspaceSession('repo'));
  await initializing;
  const status = getWorkspaceStatus(provider);
  expect(status.generationToken).toEqual(expect.any(String));
  expect(getWorkspaceStatus(provider)).toEqual(status);
  expect(factory).toHaveBeenCalledTimes(1);
  await provider[Symbol.asyncDispose]();
  expect(getWorkspaceStatus(provider).generationToken).toBeUndefined();
  expect(factory).toHaveBeenCalledTimes(1);
});

it('reports the old installed token during cleanup and no token while the replacement is being constructed', async () => {
  const closed = createDeferred<void>();
  const replacement = createDeferred<TestWorkspaceSession>();
  const factory = jest
    .fn()
    .mockResolvedValueOnce(new TestWorkspaceSession('repo', () => closed.promise))
    .mockImplementationOnce(() => replacement.promise);
  const provider = new WorkspaceSessionProvider(factory, { repoRoot: 'repo', rushVersion: '5.178.0' });
  await provider.getSessionAsync();
  const oldToken: string | undefined = provider.currentGenerationToken;
  const reload = provider.reloadAsync();
  expect(provider.currentGenerationToken).toBe(oldToken);
  closed.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(getWorkspaceStatus(provider)).toMatchObject({ generationToken: undefined, graphInitialized: false });
  replacement.resolve(new TestWorkspaceSession('repo'));
  await reload;
  expect(provider.currentGenerationToken).not.toBe(oldToken);
  expect(provider.generation).toBe(2);
  await provider[Symbol.asyncDispose]();
});
