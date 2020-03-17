// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import './mockRushCommandLineParser';

import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';
import { Interleaver } from '@rushstack/stream-collator';
import { RushCommandLineParser } from '../RushCommandLineParser';

/**
 * See `__mocks__/child_process.js`.
 */
interface ISpawnMockConfig {
  emitError: boolean;
  returnCode: number;
}

interface IChildProcessModuleMock {
  /**
   * Initialize the `spawn` mock behavior.
   */
  __setSpawnMockConfig(config?: ISpawnMockConfig): void;

  spawn: jest.Mock;
}

/**
 * Interface definition for a test instance for the RushCommandLineParser.
 */
interface IParserTestInstance {
  parser: RushCommandLineParser;
  spawnMock: jest.Mock;
}

/**
 * Configure the `child_process` `spawn` mock for these tests. This relies on the mock implementation
 * in `__mocks__/child_process.js`.
 */
function setSpawnMock(options?: ISpawnMockConfig): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cpMocked: IChildProcessModuleMock = require('child_process');
  cpMocked.__setSpawnMockConfig(options);

  const spawnMock: jest.Mock = cpMocked.spawn;
  spawnMock.mockName('spawn');
  return spawnMock;
}

/**
 * Helper to set up a test instance for RushCommandLineParser.
 */
function getCommandLineParserInstance(repoName: string, taskName: string): IParserTestInstance {
  // Point to the test repo folder
  const startPath: string = path.resolve(__dirname, repoName);

  // The `build` task is hard-coded to be incremental. So delete the package-deps file folder in
  // the test repo to guarantee the test actually runs.
  FileSystem.deleteFolder(path.resolve(__dirname, `${repoName}/a/.rush/temp`));
  FileSystem.deleteFolder(path.resolve(__dirname, `${repoName}/b/.rush/temp`));

  // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
  // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
  // repo will fail due to contention over the same lock which is kept until the test runner process
  // ends.
  const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

  // Mock the command
  process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', taskName];
  const spawnMock: jest.Mock = setSpawnMock();

  return {
    parser,
    spawnMock
  };
}

// Ordinals into the `mock.calls` array referencing each of the arguments to `spawn`
const SPAWN_ARG_ARGS: number = 1;
const SPAWN_ARG_OPTIONS: number = 2;

describe('RushCommandLineParser', () => {
  describe('execute', () => {
    afterEach(() => {
      // Reset Interleaver so we can re-register a task with the same name for the tests.
      //
      // Interleaver retains a static list of writer loggers which must have unique names. The names are the
      // names of the packages. Our unit tests use test repos with generic 'a', 'b' package names, so anything after
      // the first test that runs an instance of RushCommandLineParser throws an exception complaining of duplicate
      // writer names.
      Interleaver.reset();

      jest.clearAllMocks();
    });

    describe('in basic repo', () => {
      describe(`'build' action`, () => {
        it(`executes the package's 'build' script`, () => {
          const repoName: string = 'basicAndRunBuildActionRepo';
          const instance: IParserTestInstance = getCommandLineParserInstance(repoName, 'build');

          expect.assertions(8);
          return expect(instance.parser.execute()).resolves.toEqual(true)
            .then(() => {
              // There should be 1 build per package
              const packageCount: number = instance.spawnMock.mock.calls.length;
              expect(packageCount).toEqual(2);

              // Use regex for task name in case spaces were prepended or appended to spawned command
              const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstSpawn: any[] = instance.spawnMock.mock.calls[0];
              expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/a`));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const secondSpawn: any[] = instance.spawnMock.mock.calls[1];
              expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/b`));
            });
        });
      });

      describe(`'rebuild' action`, () => {
        it(`executes the package's 'build' script`, () => {
          const repoName: string = 'basicAndRunRebuildActionRepo';
          const instance: IParserTestInstance = getCommandLineParserInstance(repoName, 'rebuild');

          expect.assertions(8);
          return expect(instance.parser.execute()).resolves.toEqual(true)
            .then(() => {
              // There should be 1 build per package
              const packageCount: number = instance.spawnMock.mock.calls.length;
              expect(packageCount).toEqual(2);

              // Use regex for task name in case spaces were prepended or appended to spawned command
              const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstSpawn: any[] = instance.spawnMock.mock.calls[0];
              expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/a`));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const secondSpawn: any[] = instance.spawnMock.mock.calls[1];
              expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/b`));
            });
        });
      });
    });

    describe(`in repo with 'rebuild' command overridden`, () => {
      describe(`'build' action`, () => {
        it(`executes the package's 'build' script`, () => {
          const repoName: string = 'overrideRebuildAndRunBuildActionRepo';
          const instance: IParserTestInstance = getCommandLineParserInstance(repoName, 'build');

          expect.assertions(8);
          return expect(instance.parser.execute()).resolves.toEqual(true)
            .then(() => {
              // There should be 1 build per package
              const packageCount: number = instance.spawnMock.mock.calls.length;
              expect(packageCount).toEqual(2);

              // Use regex for task name in case spaces were prepended or appended to spawned command
              const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstSpawn: any[] = instance.spawnMock.mock.calls[0];
              expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/a`));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const secondSpawn: any[] = instance.spawnMock.mock.calls[1];
              expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/b`));
            });
        });
      });

      describe(`'rebuild' action`, () => {
        it(`executes the package's 'build' script`, () => {
          const repoName: string = 'overrideRebuildAndRunRebuildActionRepo';
          const instance: IParserTestInstance = getCommandLineParserInstance(repoName, 'rebuild');

          expect.assertions(8);
          return expect(instance.parser.execute()).resolves.toEqual(true)
            .then(() => {
              // There should be 1 build per package
              const packageCount: number = instance.spawnMock.mock.calls.length;
              expect(packageCount).toEqual(2);

              // Use regex for task name in case spaces were prepended or appended to spawned command
              const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstSpawn: any[] = instance.spawnMock.mock.calls[0];
              expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/a`));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const secondSpawn: any[] = instance.spawnMock.mock.calls[1];
              expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/b`));
            });
        });
      });
    });

    describe(`in repo with 'rebuild' or 'build' partially set`, () => {
      describe(`'build' action`, () => {
        it(`executes the package's 'build' script`, () => {
          const repoName: string = 'overrideAndDefaultBuildActionRepo';
          const instance: IParserTestInstance = getCommandLineParserInstance(repoName, 'build');
          expect.assertions(8);
          return expect(instance.parser.execute()).resolves.toEqual(true)
            .then(() => {
              // There should be 1 build per package
              const packageCount: number = instance.spawnMock.mock.calls.length;
              expect(packageCount).toEqual(2);

              // Use regex for task name in case spaces were prepended or appended to spawned command
              const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstSpawn: any[] = instance.spawnMock.mock.calls[0];
              expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/a`));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const secondSpawn: any[] = instance.spawnMock.mock.calls[1];
              expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/b`));
            });
        });
      });

      describe(`'rebuild' action`, () => {
        it(`executes the package's 'build' script`, () => {
          const repoName: string = 'overrideAndDefaultRebuildActionRepo';
          const instance: IParserTestInstance = getCommandLineParserInstance(repoName, 'rebuild');
          expect.assertions(8);
          return expect(instance.parser.execute()).resolves.toEqual(true)
            .then(() => {
              // There should be 1 build per package
              const packageCount: number = instance.spawnMock.mock.calls.length;
              expect(packageCount).toEqual(2);

              // Use regex for task name in case spaces were prepended or appended to spawned command
              const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstSpawn: any[] = instance.spawnMock.mock.calls[0];
              expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(firstSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/a`));

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const secondSpawn: any[] = instance.spawnMock.mock.calls[1];
              expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(expect.arrayContaining([
                expect.stringMatching(expectedBuildTaskRegexp)
              ]));
              expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
              expect(secondSpawn[SPAWN_ARG_OPTIONS].cwd).toEqual(path.resolve(__dirname, `${repoName}/b`));
            });
        });
      });
    });

    describe(`in repo with 'build' command overridden as a global command`, () => {
      it(`throws an error when starting Rush`, () => {
        const repoName: string = 'overrideBuildAsGlobalCommandRepo';

        expect.assertions(1);
        return expect(() => {
          getCommandLineParserInstance(repoName, 'doesnt-matter');
        }).toThrowError('This command can only be designated as a command kind "bulk"');
      });
    });

    describe(`in repo with 'rebuild' command overridden as a global command`, () => {
      it(`throws an error when starting Rush`, () => {
        const repoName: string = 'overrideRebuildAsGlobalCommandRepo';

        expect.assertions(1);
        return expect(() => {
          getCommandLineParserInstance(repoName, 'doesnt-matter');
        }).toThrowError('This command can only be designated as a command kind "bulk"');
      });
    });

    describe(`in repo with 'build' command overridden with 'safeForSimultaneousRushProcesses=true'`, () => {
      it(`throws an error when starting Rush`, () => {
        const repoName: string = 'overrideBuildWithSimultaneousProcessesRepo';

        expect.assertions(1);
        return expect(() => {
          getCommandLineParserInstance(repoName, 'doesnt-matter');
        }).toThrowError('"safeForSimultaneousRushProcesses=true". This configuration is not supported');
      });
    });

    describe(`in repo with 'rebuild' command overridden with 'safeForSimultaneousRushProcesses=true'`, () => {
      it(`throws an error when starting Rush`, () => {
        const repoName: string = 'overrideRebuildWithSimultaneousProcessesRepo';

        expect.assertions(1);
        return expect(() => {
          getCommandLineParserInstance(repoName, 'doesnt-matter');
        }).toThrowError('"safeForSimultaneousRushProcesses=true". This configuration is not supported');
      });
    });
  });
});
