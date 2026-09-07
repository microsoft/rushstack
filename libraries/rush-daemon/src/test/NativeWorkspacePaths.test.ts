// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush, type IOperationGraph } from '@microsoft/rush-lib';
import { FileSystem } from '@rushstack/node-core-library';

import { WorkspaceSession } from '../WorkspaceSession';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { createNativeEngineAsync } from './WarmGenerationTestUtilities';

jest.setTimeout(30_000);

describe('native daemon workspace paths', () => {
  it('loads canonical session configuration for real Git snapshots through a workspace alias', async () => {
    const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
    const aliasFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-session-alias-'));
    try {
      const root: string = await fs.promises.realpath(fixture.folder);
      const alias: string = path.join(aliasFolder, 'workspace');
      await FileSystem.createSymbolicLinkJunctionAsync({ linkTargetPath: root, newLinkPath: alias });
      const session: WorkspaceSession = await WorkspaceSession.createAsync({
        repoRoot: alias, rushVersion: Rush.version
      });
      try {
        expect(session.metadata.repoRoot).toBe(root);
        expect(session.rushConfiguration.rushJsonFolder).toBe(root);
        const engine = await createNativeEngineAsync(session.rushConfiguration);
        try {
          expect(engine.inputsSnapshot).toBeDefined();
          expect(fixture.runs()).toEqual([]);
        } finally {
          await engine[Symbol.asyncDispose]();
        }
      } finally {
        await session[Symbol.asyncDispose]();
      }
    } finally {
      await fixture[Symbol.asyncDispose]();
      fs.rmSync(aliasFolder, { recursive: true, force: true });
    }
  });

  it.each(['workspace', 'project'])(
    'selects a project through a %s alias and reuses its real graph through the canonical path',
    async (kind) => {
      const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync((created) => {
        created.write('a/nested/input.txt', 'nested');
      });
      const aliasFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-native-alias-'));
      try {
        const root: string = fs.realpathSync.native(fixture.folder);
        const alias: string = path.join(aliasFolder, 'alias');
        await FileSystem.createSymbolicLinkJunctionAsync({
          linkTargetPath: kind === 'workspace' ? root : path.join(root, 'a'),
          newLinkPath: alias
        });
        const cwd: string =
          kind === 'workspace' ? path.join(alias, 'a', 'nested') : path.join(alias, 'nested');
        expect(cwd.startsWith(root)).toBe(false);
        expect(fixture.session.rushConfiguration.rushJsonFolder).toBe(root);

        expect(
          (await fixture.runAsync(['build', '--only', '.', '--parallelism', '3'], { cwd })).terminal
        ).toMatchObject({
          kind: 'requestResult',
          payload: {
            exitCode: 0,
            scheduled: true,
            operationResults: [{ operationId: 'a (compile)', status: 'SUCCESS' }]
          }
        });
        const graph: IOperationGraph = fixture.session.operationGraph!;
        expect(graph.operations.size).toBe(3);
        expect(fixture.runs()).toEqual(['a']);

        for (const selectedCwd of [path.join(root, 'a', 'nested'), cwd]) {
          expect(
            (
              await fixture.runAsync(['build', '--only', 'path:..', '--parallelism', '3'], {
                cwd: selectedCwd
              })
            ).terminal
          ).toMatchObject({
            kind: 'requestResult',
            payload: { exitCode: 0, scheduled: false }
          });
          expect(fixture.session.operationGraph).toBe(graph);
          expect(fixture.runs()).toEqual(['a']);
        }
      } finally {
        try {
          await fixture[Symbol.asyncDispose]();
        } finally {
          fs.rmSync(aliasFolder, { recursive: true, force: true });
        }
      }
    }
  );

  it('rejects a cwd escaping through a workspace symlink before preparing or executing a graph', async () => {
    const fixture: DaemonGraphTestFixture = await DaemonGraphTestFixture.createAsync();
    const outside: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-native-outside-'));
    try {
      const escape: string = path.join(fixture.folder, 'common/temp/escape');
      await FileSystem.createSymbolicLinkJunctionAsync({
        linkTargetPath: outside,
        newLinkPath: escape
      });
      expect(
        (await fixture.runAsync(['build', '--only', 'a', '--parallelism', '3'], { cwd: escape })).terminal
      ).toMatchObject({
        kind: 'requestRejected',
        payload: {
          code: 'unsupported',
          message: 'The command working directory must be inside the daemon workspace.'
        }
      });
      expect(fixture.session.operationGraph).toBeUndefined();
      expect(fixture.runs()).toEqual([]);
    } finally {
      try {
        await fixture[Symbol.asyncDispose]();
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    }
  });
});
