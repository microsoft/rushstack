// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceInputChangeTier, type IOperationGraph } from '@microsoft/rush-lib';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { setDaemonPolicy } from './WarmGenerationTestUtilities';

jest.setTimeout(30_000);

it('applies --verbose and --parallelism per request without reloading the warm graph', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}));
  try {
    const buildAsync = async (...extra: string[]): Promise<void> => {
      const result = await fixture.runAsync(['build', '--to', 'b', ...extra]);
      expect(result.terminal).toMatchObject({ payload: { exitCode: 0 } });
    };
    await buildAsync();
    expect(fixture.runs()).toEqual(['a', 'b']);
    const generation: number = fixture.host.workspaceGeneration;
    const graph: IOperationGraph | undefined = fixture.session.operationGraph;
    const defaultParallelism: number = graph!.parallelism;
    const expectWarm = (): void => {
      expect(fixture.host.workspaceGeneration).toBe(generation);
      expect(fixture.session.operationGraph).toBe(graph);
      expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reuse);
      expect(fixture.runs()).toEqual(['a', 'b']);
    };

    await buildAsync();
    expectWarm();
    await buildAsync('--verbose');
    expectWarm();
    expect(graph!.quietMode).toBe(false);
    await buildAsync();
    expectWarm();
    expect(graph!.quietMode).toBe(true);
    await buildAsync('-p', '1', '--timeline');
    expectWarm();
    expect(graph!.parallelism).toBe(1);
    await buildAsync();
    expectWarm();
    expect(graph!.parallelism).toBe(defaultParallelism);

    fixture.write('a/input.txt', 'two');
    await buildAsync('--verbose', '-p', '1');
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});
