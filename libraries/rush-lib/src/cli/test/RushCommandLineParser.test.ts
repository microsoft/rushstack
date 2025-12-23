// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock(`@rushstack/package-deps-hash`, () => {
  return {
    getRepoRoot(dir: string): string {
      return dir;
    },
    getDetailedRepoStateAsync(): IDetailedRepoState {
      return {
        hasSubmodules: false,
        hasUncommittedChanges: false,
        files: new Map([['common/config/rush/npm-shrinkwrap.json', 'hash']]),
        symlinks: new Map()
      };
    },
    getRepoChangesAsync(): ReadonlyMap<string, string> {
      return new Map();
    },
    getGitHashForFiles(filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    },
    hashFilesAsync(rootDirectory: string, filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    }
  };
});

import './mockRushCommandLineParser';

import { FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import type { IDetailedRepoState } from '@rushstack/package-deps-hash';
import { Autoinstaller } from '../../logic/Autoinstaller';
import type { ITelemetryData } from '../../logic/Telemetry';
import { getCommandLineParserInstanceAsync } from './TestUtils';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';

function pathEquals(actual: string, expected: string): void {
  expect(Path.convertToSlashes(actual)).toEqual(Path.convertToSlashes(expected));
}

// Ordinals into the `mock.calls` array referencing each of the arguments to `spawn`
const SPAWN_ARG_ARGS: number = 1;
const SPAWN_ARG_OPTIONS: number = 2;

describe('RushCommandLineParser', () => {
  describe('execute', () => {
    afterEach(() => {
      jest.clearAllMocks();
      EnvironmentConfiguration.reset();
      jest
        .spyOn(EnvironmentConfiguration, 'buildCacheOverrideJsonFilePath', 'get')
        .mockReturnValue(undefined);
      jest.spyOn(EnvironmentConfiguration, 'buildCacheOverrideJson', 'get').mockReturnValue(undefined);
    });

    describe('in basic repo', () => {
      describe("'build' action", () => {
        it(`executes the package's 'build' script`, async () => {
          const repoName: string = 'basicAndRunBuildActionRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(repoName, 'build');

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });

      describe("'rebuild' action", () => {
        it(`executes the package's 'build' script`, async () => {
          const repoName: string = 'basicAndRunRebuildActionRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(
            repoName,
            'rebuild'
          );

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });
    });

    describe("in repo with 'rebuild' command overridden", () => {
      describe("'build' action", () => {
        it(`executes the package's 'build' script`, async () => {
          const repoName: string = 'overrideRebuildAndRunBuildActionRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(repoName, 'build');

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });

      describe("'rebuild' action", () => {
        it(`executes the package's 'rebuild' script`, async () => {
          const repoName: string = 'overrideRebuildAndRunRebuildActionRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(
            repoName,
            'rebuild'
          );

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_REbuild_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });
    });

    describe("in repo with 'rebuild' or 'build' partially set", () => {
      describe("'build' action", () => {
        it(`executes the package's 'build' script`, async () => {
          const repoName: string = 'overrideAndDefaultBuildActionRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(repoName, 'build');
          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });

      describe("'rebuild' action", () => {
        it(`executes the package's 'build' script`, async () => {
          // broken
          const repoName: string = 'overrideAndDefaultRebuildActionRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(
            repoName,
            'rebuild'
          );
          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });
    });

    describe("in repo with 'build' command overridden as a global command", () => {
      it(`throws an error when starting Rush`, async () => {
        const repoName: string = 'overrideBuildAsGlobalCommandRepo';

        await expect(async () => {
          await getCommandLineParserInstanceAsync(repoName, 'doesnt-matter');
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"command-line.json defines a command \\"build\\" using the command kind \\"global\\". This command can only be designated as a command kind \\"bulk\\" or \\"phased\\"."`
        );
      });
    });

    describe("in repo with 'rebuild' command overridden as a global command", () => {
      it(`throws an error when starting Rush`, async () => {
        const repoName: string = 'overrideRebuildAsGlobalCommandRepo';

        await expect(async () => {
          await getCommandLineParserInstanceAsync(repoName, 'doesnt-matter');
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"command-line.json defines a command \\"rebuild\\" using the command kind \\"global\\". This command can only be designated as a command kind \\"bulk\\" or \\"phased\\"."`
        );
      });
    });

    describe("in repo with 'build' command overridden with 'safeForSimultaneousRushProcesses=true'", () => {
      it(`throws an error when starting Rush`, async () => {
        const repoName: string = 'overrideBuildWithSimultaneousProcessesRepo';

        await expect(async () => {
          await getCommandLineParserInstanceAsync(repoName, 'doesnt-matter');
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"command-line.json defines a command \\"build\\" using \\"safeForSimultaneousRushProcesses=true\\". This configuration is not supported for \\"build\\"."`
        );
      });
    });

    describe("in repo with 'rebuild' command overridden with 'safeForSimultaneousRushProcesses=true'", () => {
      it(`throws an error when starting Rush`, async () => {
        const repoName: string = 'overrideRebuildWithSimultaneousProcessesRepo';

        await expect(async () => {
          await getCommandLineParserInstanceAsync(repoName, 'doesnt-matter');
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"command-line.json defines a command \\"rebuild\\" using \\"safeForSimultaneousRushProcesses=true\\". This configuration is not supported for \\"rebuild\\"."`
        );
      });
    });

    describe('in repo plugin custom flushTelemetry', () => {
      it('creates a custom telemetry file', async () => {
        const repoName: string = 'tapFlushTelemetryAndRunBuildActionRepo';
        const { parser } = await getCommandLineParserInstanceAsync(repoName, 'build');
        const telemetryFilePath: string = `${parser.rushConfiguration.commonTempFolder}/test-telemetry.json`;
        FileSystem.deleteFile(telemetryFilePath);

        /**
         * The plugin is copied into the autoinstaller folder using an option in /config/heft.json
         */
        jest.spyOn(Autoinstaller.prototype, 'prepareAsync').mockImplementation(async function () {});

        await expect(parser.executeAsync()).resolves.toEqual(true);

        expect(FileSystem.exists(telemetryFilePath)).toEqual(true);

        const telemetryStore: ITelemetryData[] = await JsonFile.loadAsync(telemetryFilePath);
        expect(telemetryStore?.[0].name).toEqual('build');
        expect(telemetryStore?.[0].result).toEqual('Succeeded');
      });
    });

    describe('in repo plugin with build command', () => {
      describe("'build' action", () => {
        it(`executes the package's 'build' script`, async () => {
          const repoName: string = 'pluginWithBuildCommandRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(repoName, 'build');

          expect(parser.getAction('build').summary).toEqual('Override build command summary in plugin');
          expect(parser.getAction('rebuild').summary).toEqual(expect.any(String));

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });

      describe("'rebuild' action", () => {
        it(`executes the package's 'rebuild' script`, async () => {
          const repoName: string = 'pluginWithBuildCommandRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(
            repoName,
            'rebuild'
          );

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });
    });

    describe('in repo plugin with rebuild command', () => {
      describe("'build' action", () => {
        it(`executes the package's 'build' script`, async () => {
          const repoName: string = 'pluginWithRebuildCommandRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(repoName, 'build');

          expect(parser.getAction('rebuild').summary).toEqual('Override rebuild command summary in plugin');
          expect(parser.getAction('build').summary).toEqual(expect.any(String));
          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_build_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });

      describe("'rebuild' action", () => {
        it(`executes the package's 'rebuild' script`, async () => {
          const repoName: string = 'pluginWithRebuildCommandRepo';
          const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(
            repoName,
            'rebuild'
          );

          await expect(parser.executeAsync()).resolves.toEqual(true);

          // There should be 1 build per package
          const packageCount: number = spawnMock.mock.calls.length;
          expect(packageCount).toEqual(2);

          // Use regex for task name in case spaces were prepended or appended to spawned command
          const expectedBuildTaskRegexp: RegExp = /fake_REbuild_task_but_works_with_mock/;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstSpawn: any[] = spawnMock.mock.calls[0];
          expect(firstSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(firstSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(firstSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/a`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const secondSpawn: any[] = spawnMock.mock.calls[1];
          expect(secondSpawn[SPAWN_ARG_ARGS]).toEqual(
            expect.arrayContaining([expect.stringMatching(expectedBuildTaskRegexp)])
          );
          expect(secondSpawn[SPAWN_ARG_OPTIONS]).toEqual(expect.any(Object));
          pathEquals(secondSpawn[SPAWN_ARG_OPTIONS].cwd, `${repoPath}/b`);
        });
      });
    });

    describe('in repo plugin with conflict build command', () => {
      it(`throws an error when starting Rush`, async () => {
        const repoName: string = 'pluginWithConflictBuildCommandRepo';

        await expect(async () => {
          await getCommandLineParserInstanceAsync(repoName, 'doesnt-matter');
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Error from plugin rush-build-command-plugin by rush-build-command-plugin: Error: command-line.json defines a command \\"build\\" using a name that already exists"`
        );
      });
    });

    describe("in repo plugin with conflict rebuild command'", () => {
      it(`throws an error when starting Rush`, async () => {
        const repoName: string = 'pluginWithConflictRebuildCommandRepo';

        await expect(async () => {
          await getCommandLineParserInstanceAsync(repoName, 'doesnt-matter');
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"command-line.json defines a parameter \\"--no-color\\" that is associated with a command \\"build\\" that is not defined in this file."`
        );
      });
    });
  });
});
