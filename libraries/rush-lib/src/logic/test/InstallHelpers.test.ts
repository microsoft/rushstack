// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, type IPackageJson, JsonFile, LockFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { TestUtilities } from '@rushstack/heft-config-file';

import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { PnpmWorkspaceFile } from '../pnpm/PnpmWorkspaceFile';
import { LastInstallFlag } from '../../api/LastInstallFlag';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';

describe(InstallHelpers.name, () => {
  describe(InstallHelpers.generateCommonPackageJsonAsync.name, () => {
    let mockJsonFileSaveAsync: jest.SpyInstance;
    let terminal: Terminal;
    let terminalProvider: StringBufferTerminalProvider;

    beforeAll(() => {
      mockJsonFileSaveAsync = jest.spyOn(JsonFile, 'saveAsync').mockImplementation(async () => true);
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
      mockJsonFileSaveAsync.mockClear();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('generates correct package json with pnpm configurations', async () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfig/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      const pnpmSettings = InstallHelpers.resolvePnpmSettings(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        terminal
      );
      await InstallHelpers.generateCommonPackageJsonAsync(
        rushConfiguration.defaultSubspace,
        undefined,
        pnpmSettings
      );
      const packageJson: IPackageJson = JSON.parse(
        JsonFile.stringify(mockJsonFileSaveAsync.mock.calls[0][0], { ignoreUndefinedValues: true })
      );
      expect(packageJson).toEqual(
        expect.objectContaining({
          pnpm: {
            overrides: {
              foo: '^2.0.0', // <-- unsupportedPackageJsonSettings.pnpm.override.foo
              quux: 'npm:@myorg/quux@^1.0.0',
              'bar@^2.1.0': '3.0.0',
              'qar@1>zoo': '2'
            },
            // For pnpm < 11 all of these settings are still written into the package.json "pnpm" field.
            packageExtensions: {
              'react-redux': {
                peerDependencies: {
                  'react-dom': '*'
                }
              }
            },
            peerDependencyRules: {
              allowedVersions: {
                react: '18'
              },
              ignoreMissing: ['@babel/core']
            },
            allowedDeprecatedVersions: {
              request: '*'
            },
            patchedDependencies: {
              'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
            },
            neverBuiltDependencies: ['fsevents', 'level'],
            onlyBuiltDependencies: ['esbuild', 'playwright'],
            pnpmFutureFeature: true
          }
        })
      );
      expect(packageJson).toMatchSnapshot();
    });

    it('does not generate a "pnpm" field for pnpm 11 (all settings belong in pnpm-workspace.yaml)', async () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfigPnpm11/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      const pnpmSettings = InstallHelpers.resolvePnpmSettings(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        terminal
      );
      await InstallHelpers.generateCommonPackageJsonAsync(
        rushConfiguration.defaultSubspace,
        undefined,
        pnpmSettings
      );
      const packageJson: IPackageJson = JSON.parse(
        JsonFile.stringify(mockJsonFileSaveAsync.mock.calls[0][0], { ignoreUndefinedValues: true })
      );
      // For pnpm >= 11 the "pnpm" field is not generated at all; every setting is written to
      // common/temp/pnpm-workspace.yaml instead.
      expect(packageJson).not.toHaveProperty('pnpm');

      // ...and the relocated settings are instead placed on the generated pnpm-workspace.yaml file.
      const workspaceFile: PnpmWorkspaceFile | undefined =
        TestUtilities.stripAnnotations(pnpmSettings)?.workspaceFile;
      expect(workspaceFile?.ignoredOptionalDependencies).toEqual(['fsevents']);
      expect(workspaceFile?.trustPolicy).toEqual('no-downgrade');
      expect(workspaceFile?.trustPolicyExclude).toEqual(['chokidar@4.0.3']);
      expect(workspaceFile?.trustPolicyIgnoreAfter).toEqual(1440);
    });
  });

  describe(InstallHelpers.ensureLocalPackageManagerAsync.name, () => {
    const tempFolderPath: string = `${__dirname}/temp/${InstallHelpers.name}`;
    const packageManager: 'pnpm' = 'pnpm';
    const packageManagerVersion: string = '10.27.0';

    function getRushGlobalFolder(): RushGlobalFolder {
      return {
        path: `${tempFolderPath}/rush-global`,
        nodeSpecificPath: `${tempFolderPath}/rush-global/node-${process.version}`
      } as RushGlobalFolder;
    }

    function getRushConfiguration(): RushConfiguration {
      return {
        commonRushConfigFolder: `${tempFolderPath}/common/config/rush`,
        commonTempFolder: `${tempFolderPath}/common/temp`,
        packageManager,
        packageManagerToolVersion: packageManagerVersion
      } as RushConfiguration;
    }

    function getPackageManagerAndVersion(): string {
      return `${packageManager}-${packageManagerVersion}`;
    }

    function getPackageManagerToolFolder(rushGlobalFolder: RushGlobalFolder): string {
      return `${rushGlobalFolder.nodeSpecificPath}/${getPackageManagerAndVersion()}`;
    }

    async function writeInstalledPackageManagerAsync(rushGlobalFolder: RushGlobalFolder): Promise<void> {
      const packageManagerToolFolder: string = getPackageManagerToolFolder(rushGlobalFolder);

      await Promise.all([
        JsonFile.saveAsync(
          {
            dependencies: {
              [packageManager]: packageManagerVersion
            },
            description: 'Temporary file generated by the Rush tool',
            name: `${packageManager}-local-install`,
            private: true,
            version: '0.0.0'
          },
          `${packageManagerToolFolder}/package.json`,
          { ensureFolderExists: true }
        ),
        JsonFile.saveAsync(
          {
            name: packageManager,
            version: packageManagerVersion
          },
          `${packageManagerToolFolder}/node_modules/${packageManager}/package.json`,
          { ensureFolderExists: true }
        ),
        FileSystem.writeFileAsync(`${packageManagerToolFolder}/node_modules/.bin/${packageManager}`, '', {
          ensureFolderExists: true
        })
      ]);

      await new LastInstallFlag(packageManagerToolFolder, { node: process.versions.node }).createAsync();
    }

    beforeEach(() => {
      jest.restoreAllMocks();
      FileSystem.ensureEmptyFolder(tempFolderPath);
    });

    afterEach(() => {
      FileSystem.deleteFolder(tempFolderPath);
      jest.restoreAllMocks();
    });

    it('does not acquire the global lock when the package manager is already installed', async () => {
      const rushGlobalFolder: RushGlobalFolder = getRushGlobalFolder();
      await writeInstalledPackageManagerAsync(rushGlobalFolder);

      const lockAcquireSpy: jest.SpyInstance = jest
        .spyOn(LockFile, 'acquireAsync')
        .mockResolvedValue(false as unknown as LockFile);
      const installSpy: jest.SpyInstance = jest
        .spyOn(Utilities, 'installPackageInDirectoryAsync')
        .mockRejectedValue(new Error('The package manager should already be installed.'));
      const rushConfiguration: RushConfiguration = getRushConfiguration();

      await InstallHelpers.ensureLocalPackageManagerAsync(rushConfiguration, rushGlobalFolder, 1, true);

      expect(lockAcquireSpy).not.toHaveBeenCalled();
      expect(installSpy).not.toHaveBeenCalled();
      await expect(
        FileSystem.existsAsync(`${rushConfiguration.commonTempFolder}/pnpm-local`)
      ).resolves.toEqual(true);
    });

    it('acquires the global lock if an install lock file is present', async () => {
      const rushGlobalFolder: RushGlobalFolder = getRushGlobalFolder();
      await writeInstalledPackageManagerAsync(rushGlobalFolder);
      await FileSystem.writeFileAsync(
        LockFile.getLockFilePath(rushGlobalFolder.nodeSpecificPath, getPackageManagerAndVersion(), 123),
        ''
      );

      const releaseLockMock: jest.Mock = jest.fn();
      const lockAcquireSpy: jest.SpyInstance = jest.spyOn(LockFile, 'acquireAsync').mockResolvedValue({
        dirtyWhenAcquired: true,
        release: releaseLockMock
      } as unknown as LockFile);
      const installSpy: jest.SpyInstance = jest
        .spyOn(Utilities, 'installPackageInDirectoryAsync')
        .mockResolvedValue();
      const rushConfiguration: RushConfiguration = getRushConfiguration();

      await InstallHelpers.ensureLocalPackageManagerAsync(rushConfiguration, rushGlobalFolder, 1, true);

      expect(lockAcquireSpy).toHaveBeenCalledTimes(1);
      expect(installSpy).toHaveBeenCalledTimes(1);
      expect(releaseLockMock).toHaveBeenCalledTimes(1);
      await expect(
        FileSystem.existsAsync(`${rushConfiguration.commonTempFolder}/pnpm-local`)
      ).resolves.toEqual(true);
    });
  });
});
