// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, type IPackageJson, JsonFile, LockFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { TestUtilities } from '@rushstack/heft-config-file';

import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';
import { LastInstallFlag } from '../../api/LastInstallFlag';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';

describe('InstallHelpers', () => {
  describe('generateCommonPackageJson', () => {
    const originalJsonFileSave = JsonFile.save;
    const mockJsonFileSave: jest.Mock = jest.fn();
    let terminal: Terminal;
    let terminalProvider: StringBufferTerminalProvider;

    beforeAll(() => {
      JsonFile.save = mockJsonFileSave;
    });

    beforeEach(() => {
      terminalProvider = new StringBufferTerminalProvider();
      terminal = new Terminal(terminalProvider);
    });

    afterEach(() => {
      expect(
        terminalProvider.getAllOutputAsChunks({
          normalizeSpecialCharacters: true,
          asLines: true
        })
      ).toMatchSnapshot('Terminal Output');
      mockJsonFileSave.mockClear();
    });

    afterAll(() => {
      JsonFile.save = originalJsonFileSave;
    });

    it('generates correct package json with pnpm configurations', () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfig/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      InstallHelpers.generateCommonPackageJson(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        undefined,
        terminal
      );
      const packageJson: IPackageJson = mockJsonFileSave.mock.calls[0][0];
      expect(TestUtilities.stripAnnotations(packageJson)).toEqual(
        expect.objectContaining({
          pnpm: {
            overrides: {
              foo: '^2.0.0', // <-- unsupportedPackageJsonSettings.pnpm.override.foo
              quux: 'npm:@myorg/quux@^1.0.0',
              'bar@^2.1.0': '3.0.0',
              'qar@1>zoo': '2'
            },
            packageExtensions: {
              'react-redux': {
                peerDependencies: {
                  'react-dom': '*'
                }
              }
            },
            neverBuiltDependencies: ['fsevents', 'level'],
            onlyBuiltDependencies: ['esbuild', 'playwright'],
            pnpmFutureFeature: true
          }
        })
      );
    });
  });

  describe(InstallHelpers.ensureLocalPackageManagerAsync.name, () => {
    const tempFolderPath: string = `${__dirname}/temp/${InstallHelpers.name}`;

    beforeEach(() => {
      FileSystem.ensureEmptyFolder(tempFolderPath);
    });

    afterEach(() => {
      FileSystem.deleteFolder(tempFolderPath);
      jest.restoreAllMocks();
    });

    it('does not acquire the global lock when the package manager is already installed', async () => {
      const rushGlobalFolder: RushGlobalFolder = {
        path: `${tempFolderPath}/rush-global`,
        nodeSpecificPath: `${tempFolderPath}/rush-global/node-${process.version}`
      } as RushGlobalFolder;
      const packageManagerToolFolder: string = path.join(rushGlobalFolder.nodeSpecificPath, 'pnpm-10.27.0');
      await new LastInstallFlag(packageManagerToolFolder, { node: process.versions.node }).createAsync();

      const lockAcquireSpy: jest.SpyInstance = jest.spyOn(LockFile, 'acquireAsync');
      const rushConfiguration: RushConfiguration = {
        commonRushConfigFolder: `${tempFolderPath}/common/config/rush`,
        commonTempFolder: `${tempFolderPath}/common/temp`,
        packageManager: 'pnpm',
        packageManagerToolVersion: '10.27.0'
      } as RushConfiguration;

      await InstallHelpers.ensureLocalPackageManagerAsync(rushConfiguration, rushGlobalFolder, 1, true);

      expect(lockAcquireSpy).not.toHaveBeenCalled();
      expect(FileSystem.exists(`${rushConfiguration.commonTempFolder}/pnpm-local`)).toEqual(true);
    });

    it('acquires the global lock if an install lock file is present', async () => {
      const rushGlobalFolder: RushGlobalFolder = {
        path: `${tempFolderPath}/rush-global`,
        nodeSpecificPath: `${tempFolderPath}/rush-global/node-${process.version}`
      } as RushGlobalFolder;
      const packageManagerToolFolder: string = path.join(rushGlobalFolder.nodeSpecificPath, 'pnpm-10.27.0');
      await new LastInstallFlag(packageManagerToolFolder, { node: process.versions.node }).createAsync();
      FileSystem.writeFile(`${rushGlobalFolder.nodeSpecificPath}/pnpm-10.27.0#123.lock`, '');

      const releaseAsync: jest.Mock = jest.fn();
      const lockAcquireSpy: jest.SpyInstance = jest.spyOn(LockFile, 'acquireAsync').mockResolvedValue({
        dirtyWhenAcquired: true,
        release: releaseAsync
      } as unknown as LockFile);
      const installSpy: jest.SpyInstance = jest
        .spyOn(Utilities, 'installPackageInDirectoryAsync')
        .mockResolvedValue();
      const rushConfiguration: RushConfiguration = {
        commonRushConfigFolder: `${tempFolderPath}/common/config/rush`,
        commonTempFolder: `${tempFolderPath}/common/temp`,
        packageManager: 'pnpm',
        packageManagerToolVersion: '10.27.0'
      } as RushConfiguration;

      await InstallHelpers.ensureLocalPackageManagerAsync(rushConfiguration, rushGlobalFolder, 1, true);

      expect(lockAcquireSpy).toHaveBeenCalledTimes(1);
      expect(installSpy).toHaveBeenCalledTimes(1);
      expect(releaseAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.exists(`${rushConfiguration.commonTempFolder}/pnpm-local`)).toEqual(true);
    });
  });
});
