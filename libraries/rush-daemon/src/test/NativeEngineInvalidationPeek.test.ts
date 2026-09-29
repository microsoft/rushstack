// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  OperationStatus,
  type IOperationExecutionResult,
  type IOperationGraph,
  type Operation
} from '@microsoft/rush-lib';

import type { IWorkspaceInvalidationPeek } from '../WorkspaceEngineComponentFactory';
import { createFixtureAsync, runAsync, runs, type IFixture } from './NativeEngineTestFixture';

jest.setTimeout(30_000);

describe('peeking at the invalidations of a native engine for its executing iteration', () => {
  it('maps the outputs that changed, except those of dispatched operations, and leaves them to the next build', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      await runAsync(fixture, 'initial', ['build']);
      expect(runs(fixture)).toHaveLength(3);
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const getOperation = (name: string): Operation =>
        Array.from(graph.operations).find(
          (operation: Operation) => operation.associatedProject.packageName === name
        )!;
      fs.rmSync(path.join(fixture.repoRoot, 'projects/a/lib'), { recursive: true });
      fs.rmSync(path.join(fixture.repoRoot, 'projects/c/lib'), { recursive: true });
      // An iteration that executes a may be writing its outputs.
      const executingIterationRecords: ReadonlyMap<Operation, IOperationExecutionResult> = new Map([
        [getOperation('a'), { enabled: true, status: OperationStatus.Executing } as IOperationExecutionResult]
      ]);

      const peek: IWorkspaceInvalidationPeek | undefined = await fixture.session.peekInvalidationsAsync({
        executingIterationRecords
      });
      expect(peek?.invalidatedOperations).toEqual(new Set([getOperation('c')]));
      peek!.discard();
      expect((await runAsync(fixture, 'deleted', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(runs(fixture).slice(3).sort()).toEqual(['a:one:', 'c:one:']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('offers no peek for an engine that rebuilds, which runs every operation of each request', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      expect((await runAsync(fixture, 'rebuild', ['rebuild', '--only', 'a'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });

      await expect(
        fixture.session.peekInvalidationsAsync({ executingIterationRecords: new Map() })
      ).resolves.toBeUndefined();
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
