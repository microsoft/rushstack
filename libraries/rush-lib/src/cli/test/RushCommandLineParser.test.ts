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
    hashFilesAsync(rootDirectory: string, filePaths: Iterable<string>): Promise<ReadonlyMap<string, string>> {
      return Promise.resolve(new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath])));
    }
  };
});

import './mockRushCommandLineParser.ts';

import type { SpawnOptions } from 'node:child_process';
import { FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import type { IDetailedRepoState } from '@rushstack/package-deps-hash';
import { Autoinstaller } from '../../logic/Autoinstaller.ts';
import type { ITelemetryData } from '../../logic/Telemetry.ts';
import {
  getCommandLineParserInstanceAsync,
  type SpawnMockArgs,
  type SpawnMockCall,
  isolateEnvironmentConfigurationForTests,
  type IEnvironmentConfigIsolation
} from './TestUtils.ts';
import { IS_WINDOWS } from '../../utilities/executionUtilities.ts';

// Ordinals into the `mock.calls` array referencing each of the arguments to `spawn`. Note that
// the exact structure of these arguments differs between Windows and non-Windows platforms, so
// we only reference the one that is common.
const SPAWN_ARG_OPTIONS: number = 2;

function spawnOptionEquals<TOption extends keyof SpawnOptions, TExepcted>(
  spawnCall: SpawnMockCall,
  optionName: TOption,
  expected: TExepcted,
  tweakActual: (actual: SpawnOptions[TOption]) => TExepcted = (x) => x as TExepcted
): void {
  const spawnOptions: SpawnOptions = spawnCall[SPAWN_ARG_OPTIONS] as SpawnOptions;
  expect(spawnOptions).toEqual(expect.any(Object));
  expect(tweakActual(spawnOptions[optionName])).toEqual(expected);
}

function cwdOptionEquals(spawnCall: SpawnMockCall, expected: string): void {
  spawnOptionEquals(spawnCall, 'cwd', Path.convertToSlashes(expected), (actual) =>
    Path.convertToSlashes(String(actual))
  );
}

jest.setTimeout(1000000);

function expectSpawnToMatchRegexp(spawnCall: SpawnMockCall, expectedRegexp: RegExp): void {
  if (IS_WINDOWS) {
    // On Windows, the command is passed as a single string with the `shell: true` option
    spawnOptionEquals(spawnCall, 'shell', true);
    expect(spawnCall[0]).toMatch(expectedRegexp);
  } else {
    expect(spawnCall[1]).toEqual(expect.arrayContaining([expect.stringMatching(expectedRegexp)]));
  }
}

describe('RushCommandLineParser', () => {
  describe('execute', () => {
    let _envIsolation: IEnvironmentConfigIsolation;

    beforeEach(() => {
      _envIsolation = isolateEnvironmentConfigurationForTests();
    });

    afterEach(() => {
      jest.clearAllMocks();
      _envIsolation.restore();
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

          const firstSpawn: SpawnMockArgs = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockArgs = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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

          const firstSpawn: SpawnMockCall = spawnMock.mock.calls[0];
          expectSpawnToMatchRegexp(firstSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(firstSpawn, `${repoPath}/a`);

          const secondSpawn: SpawnMockCall = spawnMock.mock.calls[1];
          expectSpawnToMatchRegexp(secondSpawn, expectedBuildTaskRegexp);
          cwdOptionEquals(secondSpawn, `${repoPath}/b`);
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
