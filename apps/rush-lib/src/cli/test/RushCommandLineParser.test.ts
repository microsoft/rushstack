// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Mock process so we can verify tasks are (or are not) invoked as we expect
jest.mock('child_process');

import { resolve } from 'path';
import { chdir } from 'process';
import { ChildProcessModuleMock, ISpawnMockConfig } from 'child_process';
import { FileSystem } from '@microsoft/node-core-library';
import { RushCommandLineParser } from '../RushCommandLineParser';

/**
 * Configure the `child_process` `spawn` mock for these tests. This relies on the mock implementation
 * in `__mocks__/child_process.js`.
 */
function setSpawnMock(options?: ISpawnMockConfig): jest.Mock {
  const cpMocked: ChildProcessModuleMock = require('child_process');
  cpMocked.__setSpawnMockConfig(options);

  const spawnMock: jest.Mock = cpMocked.spawn;
  spawnMock.mockName('spawn');
  return spawnMock;
}

// Ordinals into the `mock.calls` array referencing each of the arguments to `spawn`
const SPAWN_ARG_ARGS: number = 1;
const SPAWN_ARG_OPTIONS: number = 2;

describe('RushCommandLineParser', () => {
  describe('execute', () => {
    describe(`'build' action`, () => {
      it(`executes the package's 'build' script`, () => {
        // Point to the test repo folder
        chdir(resolve(__dirname, 'buildActionsRepo'));

        // The `build` task is hard-coded to be incremental. So delete the `package-deps.json` files in
        // the test repo to override so the test actually runs.
        FileSystem.deleteFile(resolve(__dirname, 'buildActionsRepo/a/package-deps.json'));
        FileSystem.deleteFile(resolve(__dirname, 'buildActionsRepo/b/package-deps.json'));

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` test blocks over the same test
        // repo will fail due to contention over the same lock.
        const parser: RushCommandLineParser = new RushCommandLineParser();

        // Mock the command
        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'build'];
        const spawnMock: jest.Mock = setSpawnMock();

        expect.assertions(8);
        return expect(parser.execute()).resolves.toEqual(true)
          .then(() => {
            // There should be 1 build per package
            const packageCount: number = spawnMock.mock.calls.length;
            expect(packageCount).toEqual(2);

            // Use regex for task name in case spaces were prepended or appended to spawned command
            const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

            // tslint:disable-next-line: no-any
            const firstSpawn: any[] = spawnMock.mock.calls[0];
            expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
              expect.stringMatching(expectedBuildTaskRegexp)
            ]));
            expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
            expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(resolve(__dirname, 'buildActionsRepo/a'));

            // tslint:disable-next-line: no-any
            const secondSpawn: any[] = spawnMock.mock.calls[1];
            expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
              expect.stringMatching(expectedBuildTaskRegexp)
            ]));
            expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
            expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(resolve(__dirname, 'buildActionsRepo/b'));
          });
      });
    });
  });
});