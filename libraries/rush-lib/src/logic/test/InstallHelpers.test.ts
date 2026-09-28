// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem, type IPackageJson, JsonFile, LockFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { TestUtilities } from '@rushstack/heft-config-file';

import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';
import type { PnpmWorkspaceFile } from '../pnpm/PnpmWorkspaceFile';

describe(InstallHelpers.name, () => {
  describe(InstallHelpers.shouldProvideNpmrcCredentialsViaEnvironment.name, () => {
    let rushConfiguration: RushConfiguration;
    let experimentsConfigurationMock: ReturnType<typeof jest.replaceProperty>;

    beforeAll(() => {
      rushConfiguration = RushConfiguration.loadFromConfigurationFile(`${__dirname}/pnpmConfig/rush.json`);
      experimentsConfigurationMock = jest.replaceProperty(
        rushConfiguration.experimentsConfiguration,
        'configuration',
        { provideNpmrcCredentialsViaEnvironment: true }
      );
    });

    afterAll(() => {
      experimentsConfigurationMock.restore();
    });

    it.each([
      ['10.34.1', false],
      ['10.34.2', true],
      ['10.35.0-rc.1', true],
      ['10.99.0', true],
      ['11.5.2', false],
      ['11.5.3', true],
      ['11.6.0-rc.1', true],
      ['11.6.0', false],
      ['12.0.0', false]
    ])('for PNPM version %s returns %s', (pnpmVersion: string, expectedResult: boolean) => {
      const packageManagerToolVersionMock = jest.replaceProperty(
        rushConfiguration,
        'packageManagerToolVersion',
        pnpmVersion
      );

      try {
        expect(InstallHelpers.shouldProvideNpmrcCredentialsViaEnvironment(rushConfiguration)).toBe(
          expectedResult
        );
      } finally {
        packageManagerToolVersionMock.restore();
      }
    });
  });

  describe(InstallHelpers.getPackageManagerEnvironment.name, () => {
    it('does not modify process.env', () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfig/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      const environmentVariableName: string = 'RUSH_TEST_PACKAGE_MANAGER_ENVIRONMENT';
      const originalValue: string | undefined = process.env[environmentVariableName];

      const packageManagerEnvironment: NodeJS.ProcessEnv =
        InstallHelpers.getPackageManagerEnvironment(rushConfiguration);
      packageManagerEnvironment[environmentVariableName] = 'test value';

      expect(process.env[environmentVariableName]).toBe(originalValue);
    });
  });

  describe(InstallHelpers.ensureLocalPackageManagerAsync.name, () => {
    const packageManagerVersion: string = '8.14.0';
    const lockResourceName: string = `pnpm-${packageManagerVersion}`;
    let tempFolder: string;
    let rushConfiguration: RushConfiguration;
    let rushGlobalFolder: RushGlobalFolder;
    let installPackageMock: jest.SpyInstance;

    beforeEach(() => {
      tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-ensure-local-package-manager-'));
      rushConfiguration = {
        packageManager: 'pnpm',
        packageManagerToolVersion: packageManagerVersion,
        commonRushConfigFolder: `${tempFolder}/repo/common/config/rush`,
        commonTempFolder: `${tempFolder}/repo/common/temp`
      } as unknown as RushConfiguration;
      rushGlobalFolder = { nodeSpecificPath: `${tempFolder}/rush-home` } as unknown as RushGlobalFolder;
      installPackageMock = jest
        .spyOn(Utilities, 'installPackageInDirectoryAsync')
        .mockRejectedValue(new Error('Unexpected package manager install'));
    });

    afterEach(() => {
      installPackageMock.mockRestore();
      fs.rmSync(tempFolder, { recursive: true, force: true });
    });

    it('releases the package manager lock when the install fails, so the same process can retry', async () => {
      installPackageMock
        .mockRejectedValueOnce(new Error('npm error code E401'))
        .mockResolvedValueOnce(undefined);

      await expect(
        InstallHelpers.ensureLocalPackageManagerAsync(rushConfiguration, rushGlobalFolder, 1, true)
      ).rejects.toThrow('npm error code E401');

      // A Rush daemon calls this again in the same process. If the failed call still held the lock,
      // tryAcquire would return undefined here and the retry below would wait forever.
      const lockAfterFailure: LockFile | undefined = LockFile.tryAcquire(
        rushGlobalFolder.nodeSpecificPath,
        lockResourceName
      );
      expect(lockAfterFailure).toBeDefined();
      lockAfterFailure?.release();

      await InstallHelpers.ensureLocalPackageManagerAsync(rushConfiguration, rushGlobalFolder, 1, true);

      expect(installPackageMock).toHaveBeenCalledTimes(2);
      await expect(
        FileSystem.getLinkStatisticsAsync(`${rushConfiguration.commonTempFolder}/pnpm-local`)
      ).resolves.toBeDefined();
      const lockAfterSuccess: LockFile | undefined = LockFile.tryAcquire(
        rushGlobalFolder.nodeSpecificPath,
        lockResourceName
      );
      expect(lockAfterSuccess).toBeDefined();
      lockAfterSuccess?.release();
    });
  });

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

      // The subspaces feature is not enabled in this repo, so no global pnpmfile is emitted.
      expect(workspaceFile?.globalPnpmfile).toBeUndefined();
    });

    it('emits the subspace global pnpmfile path via pnpm-workspace.yaml for pnpm 11', async () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfigPnpm11Subspaces/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      const pnpmSettings = InstallHelpers.resolvePnpmSettings(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        terminal
      );

      // pnpm 11+ only reads auth/registry settings from .npmrc, so the "global-pnpmfile=" line in
      // the generated .npmrc is ignored; the path must be emitted via pnpm-workspace.yaml instead,
      // otherwise cross-subspace "workspace:*" dependencies fail with
      // ERR_PNPM_WORKSPACE_PKG_NOT_FOUND.
      const workspaceFile: PnpmWorkspaceFile | undefined =
        TestUtilities.stripAnnotations(pnpmSettings)?.workspaceFile;
      expect(workspaceFile?.globalPnpmfile).toEqual(
        `${rushConfiguration.defaultSubspace.getSubspaceTempFolderPath()}/global-pnpmfile.cjs`
      );
    });

    it('does not emit the global pnpmfile via pnpm-workspace.yaml for pnpm < 11', async () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/repoWithSubspaces/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      const pnpmSettings = InstallHelpers.resolvePnpmSettings(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        terminal
      );

      // For pnpm 10 and earlier the global pnpmfile stays wired up via the generated .npmrc
      // (see BaseInstallManager); the workspace file must not carry it.
      const workspaceFile: PnpmWorkspaceFile | undefined =
        TestUtilities.stripAnnotations(pnpmSettings)?.workspaceFile;
      expect(workspaceFile?.globalPnpmfile).toBeUndefined();
    });
  });
});
