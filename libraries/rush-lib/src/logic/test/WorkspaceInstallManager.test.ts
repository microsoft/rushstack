// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { EnvironmentConfiguration, EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { Subspace } from '../../api/Subspace';
import { WorkspaceInstallManager } from '../installManager/WorkspaceInstallManager';
import { PurgeManager } from '../PurgeManager';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes';
import type { PnpmStoreLocation } from '../pnpm/PnpmOptionsConfiguration';

interface IGlobalVirtualStoreValidationOptions {
  pnpmVersion: string;
  pnpmConfigFilename: string;
  rushJsonFolder: string;
  pnpmStore: PnpmStoreLocation;
  pnpmStorePath: string;
  pnpmStorePathOverride: string | undefined;
  usePnpmSyncForInjectedDependencies: boolean | undefined;
}

interface IWorkspaceInstallManagerWithValidation {
  _validateGlobalVirtualStoreOptions(options: IGlobalVirtualStoreValidationOptions): void;
}

class TestWorkspaceInstallManager extends WorkspaceInstallManager {
  public async prepareCommonTempForTestAsync(subspace: Subspace): Promise<void> {
    await super.prepareCommonTempAsync(subspace, undefined);
  }
}

describe(WorkspaceInstallManager.name, () => {
  describe('enableGlobalVirtualStore validation', () => {
    const validateGlobalVirtualStoreOptions: (options: IGlobalVirtualStoreValidationOptions) => void = (
      WorkspaceInstallManager as unknown as IWorkspaceInstallManagerWithValidation
    )._validateGlobalVirtualStoreOptions;

    it('throws if the configured PNPM version does not support global virtual store', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.0',
          pnpmConfigFilename: '/repo/common/config/rush/pnpm-config.json',
          rushJsonFolder: '/repo',
          pnpmStore: 'global',
          pnpmStorePath: '',
          pnpmStorePathOverride: undefined,
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).toThrow('Your version of PNPM (10.12.0) doesn\'t support the "enableGlobalVirtualStore" field');
    });

    it('throws if global virtual store is enabled with a worktree-local PNPM store', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
          pnpmConfigFilename: '/repo/common/config/rush/pnpm-config.json',
          rushJsonFolder: '/repo',
          pnpmStore: 'local',
          pnpmStorePath: '/repo/common/temp/pnpm-store',
          pnpmStorePathOverride: undefined,
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).toThrow(`Set "pnpmStore" to "global" or use ${EnvironmentVariableNames.RUSH_PNPM_STORE_PATH}.`);
    });

    it('throws if global virtual store is enabled with pnpm-sync for injected dependencies', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
          pnpmConfigFilename: '/repo/common/config/rush/pnpm-config.json',
          rushJsonFolder: '/repo',
          pnpmStore: 'global',
          pnpmStorePath: '',
          pnpmStorePathOverride: undefined,
          usePnpmSyncForInjectedDependencies: true
        })
      ).toThrow(
        'The "enableGlobalVirtualStore" setting is not compatible with the ' +
          '"usePnpmSyncForInjectedDependencies" experiment'
      );
    });

    it('throws if the PNPM store path override points inside the Rush repo', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
          pnpmConfigFilename: '/repo/common/config/rush/pnpm-config.json',
          rushJsonFolder: '/repo',
          pnpmStore: 'local',
          pnpmStorePath: '/repo/common/temp/pnpm-store',
          pnpmStorePathOverride: '/repo/common/temp/shared-pnpm-store',
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).toThrow(
        `The ${EnvironmentVariableNames.RUSH_PNPM_STORE_PATH} environment variable points inside the Rush repo`
      );
    });

    it('allows global virtual store with a PNPM store path override', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
          pnpmConfigFilename: '/repo/common/config/rush/pnpm-config.json',
          rushJsonFolder: '/repo',
          pnpmStore: 'local',
          pnpmStorePath: '/repo/common/temp/pnpm-store',
          pnpmStorePathOverride: '/shared/pnpm-store',
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).not.toThrow();
    });
  });

  describe('prepareCommonTempAsync', () => {
    const fixtureRepoPath: string = path.resolve(__dirname, 'repoWithSubspacesCatalogs');
    const tempFolderPath: string = `${__dirname}/temp/${WorkspaceInstallManager.name}`;
    let originalPnpmStorePathOverride: string | undefined;
    let originalPnpmStorePathEnvValue: string | undefined;

    beforeEach(() => {
      originalPnpmStorePathEnvValue = process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      EnvironmentConfiguration.reset();
      EnvironmentConfiguration.validate({ doNotNormalizePaths: true });
      originalPnpmStorePathOverride = EnvironmentConfiguration.pnpmStorePathOverride;
      EnvironmentConfiguration['_pnpmStorePathOverride'] = undefined;
      FileSystem.ensureEmptyFolder(tempFolderPath);
    });

    afterEach(() => {
      if (originalPnpmStorePathEnvValue === undefined) {
        delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      } else {
        process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH] = originalPnpmStorePathEnvValue;
      }
      EnvironmentConfiguration['_pnpmStorePathOverride'] = originalPnpmStorePathOverride;
      EnvironmentConfiguration.reset();
      FileSystem.deleteFolder(tempFolderPath);
    });

    function prepareFixtureRepo(options: { pnpmStore?: PnpmStoreLocation }): RushConfiguration {
      const repoPath: string = `${tempFolderPath}/repo`;
      FileSystem.copyFiles({
        sourcePath: fixtureRepoPath,
        destinationPath: repoPath
      });

      const rushJsonPath: string = `${repoPath}/rush.json`;
      const rushJson: Record<string, unknown> = JsonFile.load(rushJsonPath);
      rushJson.pnpmVersion = '10.12.1';
      JsonFile.save(rushJson, rushJsonPath, { updateExistingFile: true });

      const commonPnpmConfigPath: string = `${repoPath}/common/config/rush/pnpm-config.json`;
      const commonPnpmConfigJson: Record<string, unknown> = JsonFile.load(commonPnpmConfigPath);
      if (options.pnpmStore) {
        commonPnpmConfigJson.pnpmStore = options.pnpmStore;
      } else {
        delete commonPnpmConfigJson.pnpmStore;
      }
      JsonFile.save(commonPnpmConfigJson, commonPnpmConfigPath, { updateExistingFile: true });

      const subspacePnpmConfigPath: string = `${repoPath}/common/config/subspaces/default/pnpm-config.json`;
      const subspacePnpmConfigJson: Record<string, unknown> = JsonFile.load(subspacePnpmConfigPath);
      subspacePnpmConfigJson.enableGlobalVirtualStore = true;
      JsonFile.save(subspacePnpmConfigJson, subspacePnpmConfigPath, { updateExistingFile: true });

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      FileSystem.ensureFolder(rushConfiguration.defaultSubspace.getSubspaceTempFolderPath());
      return rushConfiguration;
    }

    function createInstallManager(rushConfiguration: RushConfiguration): TestWorkspaceInstallManager {
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      const options: IInstallManagerOptions = {
        allowShrinkwrapUpdates: true,
        fullUpgrade: false,
        variant: undefined,
        subspace: rushConfiguration.defaultSubspace,
        terminal
      } as unknown as IInstallManagerOptions;
      const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();

      return new TestWorkspaceInstallManager(
        rushConfiguration,
        rushGlobalFolder,
        new PurgeManager(rushConfiguration, rushGlobalFolder),
        options
      );
    }

    it('writes enableGlobalVirtualStore through the workspace install prepare path', async () => {
      const rushConfiguration: RushConfiguration = prepareFixtureRepo({ pnpmStore: 'global' });
      const installManager: TestWorkspaceInstallManager = createInstallManager(rushConfiguration);

      await installManager.prepareCommonTempForTestAsync(rushConfiguration.defaultSubspace);

      const workspaceYaml: string = FileSystem.readFile(
        `${rushConfiguration.defaultSubspace.getSubspaceTempFolderPath()}/pnpm-workspace.yaml`
      );
      expect(workspaceYaml).toContain('enableGlobalVirtualStore: true');
      expect(Path.convertToSlashes(workspaceYaml)).toContain('../../../a');
    });

    it('throws from the workspace install prepare path when using a worktree-local PNPM store', async () => {
      const rushConfiguration: RushConfiguration = prepareFixtureRepo({});
      const installManager: TestWorkspaceInstallManager = createInstallManager(rushConfiguration);

      expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
      expect(rushConfiguration.defaultSubspace.getPnpmOptions()?.enableGlobalVirtualStore).toEqual(true);

      await expect(
        installManager.prepareCommonTempForTestAsync(rushConfiguration.defaultSubspace)
      ).rejects.toThrow(
        `Set "pnpmStore" to "global" or use ${EnvironmentVariableNames.RUSH_PNPM_STORE_PATH}.`
      );
    });
  });
});
