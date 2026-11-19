// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceInputChangeTier } from '@microsoft/rush-lib';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { setDaemonPolicy } from './WarmGenerationTestUtilities';

jest.setTimeout(30_000);

// Engine code runs in the daemon process, and a Rush plugin may add its own names to process.env there.
const ADDED_NAME: string = 'RUSHD_TEST_PLUGIN_ADDED';

afterEach(() => {
  delete process.env[ADDED_NAME];
});

it('keeps serving the warm generation after a plugin adds a name to process.env', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}));
  try {
    await fixture.buildSuccessfullyAsync();
    await fixture.buildSuccessfullyAsync();
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reuse);
    const generation: number = fixture.host.workspaceGeneration;
    const graph = fixture.session.operationGraph;
    process.env[ADDED_NAME] = 'iteration-1';

    expect((await fixture.graphAsync('invalidate', '--project', 'a')).terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 0 }
    });
    process.env[ADDED_NAME] = 'iteration-2';
    await fixture.buildSuccessfullyAsync();
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reuse);
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(fixture.session.operationGraph).toBe(graph);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});
