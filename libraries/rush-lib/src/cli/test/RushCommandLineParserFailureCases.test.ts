// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Mock child_process so we can verify tasks are (or are not) invoked as we expect
jest.mock('node:child_process', () => jest.requireActual('./mock_child_process'));
jest.mock('@rushstack/terminal');
jest.mock(`@rushstack/package-deps-hash`, () => {
  return {
    getRepoRoot(dir: string): string {
      return dir;
    },
    getDetailedRepoStateAsync(): IDetailedRepoState {
      return {
        hasSubmodules: false,
        hasUncommittedChanges: false,
        files: new Map(),
        symlinks: new Map()
      };
    },
    getRepoChangesAsync(): ReadonlyMap<string, string> {
      return new Map();
    }
  };
});

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import type { IDetailedRepoState } from '@rushstack/package-deps-hash';
import { Autoinstaller } from '../../logic/Autoinstaller';
import type { ITelemetryData } from '../../logic/Telemetry';
import { getCommandLineParserInstanceAsync, setSpawnMock } from './TestUtils';

describe('RushCommandLineParserFailureCases', () => {
  describe('execute', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('in repo plugin custom flushTelemetry', () => {
      it('custom telemetry reports errors', async () => {
        const repoName: string = 'tapFlushTelemetryAndRunBuildActionRepo';

        // WARNING: This test case needs the real implementation of _reportErrorAndSetExitCode.
        // As a result, process.exit needs to be explicitly mocked to prevent the test runner from exiting.
        const procProm = new Promise<void>((resolve, reject) => {
          jest.spyOn(process, 'exit').mockImplementation((() => {
            resolve();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any);
        });

        const { parser } = await getCommandLineParserInstanceAsync(repoName, 'build');

        const telemetryFilePath: string = `${parser.rushConfiguration.commonTempFolder}/test-telemetry.json`;
        FileSystem.deleteFile(telemetryFilePath);

        jest.spyOn(Autoinstaller.prototype, 'prepareAsync').mockImplementation(async function () {});

        setSpawnMock({ emitError: false, returnCode: 1 });
        await parser.executeAsync();
        await procProm;
        expect(process.exit).toHaveBeenCalledWith(1);

        expect(FileSystem.exists(telemetryFilePath)).toEqual(true);

        const telemetryStore: ITelemetryData[] = JsonFile.load(telemetryFilePath);
        expect(telemetryStore?.[0].name).toEqual('build');
        expect(telemetryStore?.[0].result).toEqual('Failed');
      });
    });
  });
});
