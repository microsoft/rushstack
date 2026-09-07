// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { EnvironmentConfiguration, EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { Subspace } from '../../api/Subspace';
import {
  WorkspaceInstallManager,
  validateGlobalVirtualStoreOptions
} from '../installManager/WorkspaceInstallManager';
import { PurgeManager } from '../PurgeManager';
import type { IInstallManagerOptions } from '../base/BaseInstallManagerTypes';
import type { PnpmStoreLocation } from '../pnpm/PnpmOptionsConfiguration';

class TestWorkspaceInstallManager extends WorkspaceInstallManager {
  public async prepareCommonTempForTestAsync(subspace: Subspace): Promise<void> {
    await super.prepareCommonTempAsync(subspace, undefined);
  }
}

describe(WorkspaceInstallManager.name, () => {
  describe('enableGlobalVirtualStore validation', () => {
    it('throws if the configured PNPM version does not support global virtual store', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.0',
          rushJsonFolder: '/repo',
          pnpmStore: 'global',
          pnpmStorePath: '',
          pnpmStorePathOverride: undefined,
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).toThrow(
        `Your version of PNPM (10.12.0) doesn't support the ` +
          `${EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE} environment variable`
      );
    });

    it('throws if global virtual store is enabled with a worktree-local PNPM store', () => {
      expect(() =>
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
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
          rushJsonFolder: '/repo',
          pnpmStore: 'global',
          pnpmStorePath: '',
          pnpmStorePathOverride: undefined,
          usePnpmSyncForInjectedDependencies: true
        })
      ).toThrow(
        `The ${EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE} environment ` +
          `variable is not compatible with the ` +
          '"usePnpmSyncForInjectedDependencies" experiment'
      );
    });

    it('warns if the PNPM store path override points inside the Rush repo', () => {
      expect(
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
          rushJsonFolder: '/repo',
          pnpmStore: 'local',
          pnpmStorePath: '/repo/common/temp/pnpm-store',
          pnpmStorePathOverride: '/repo/common/temp/shared-pnpm-store',
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).toContain(
        `The ${EnvironmentVariableNames.RUSH_PNPM_STORE_PATH} environment variable points inside ` +
          `the Rush repo`
      );
    });

    it('allows global virtual store with a PNPM store path override', () => {
      expect(
        validateGlobalVirtualStoreOptions({
          pnpmVersion: '10.12.1',
          rushJsonFolder: '/repo',
          pnpmStore: 'local',
          pnpmStorePath: '/repo/common/temp/pnpm-store',
          pnpmStorePathOverride: '/shared/pnpm-store',
          usePnpmSyncForInjectedDependencies: undefined
        })
      ).toBeUndefined();
    });
  });

  describe('prepareCommonTempAsync', () => {
    const fixtureRepoPath: string = `${__dirname}/repoWithSubspacesCatalogs`;
    const tempFolderPath: string = `${__dirname}/temp/${WorkspaceInstallManager.name}`;

    beforeEach(async () => {
      jest.replaceProperty(process, 'env', { ...process.env });
      delete process.env[EnvironmentVariableNames.RUSH_PNPM_STORE_PATH];
      delete process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE];
      EnvironmentConfiguration.reset();
      EnvironmentConfiguration.validate({ doNotNormalizePaths: true });
      await FileSystem.ensureEmptyFolderAsync(tempFolderPath);
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      EnvironmentConfiguration.reset();
      await FileSystem.deleteFolderAsync(tempFolderPath);
    });

    async function prepareFixtureRepoAsync(options: {
      pnpmStore?: PnpmStoreLocation;
    }): Promise<RushConfiguration> {
      const repoPath: string = `${tempFolderPath}/repo`;
      await FileSystem.copyFilesAsync({
        sourcePath: fixtureRepoPath,
        destinationPath: repoPath
      });

      const rushJsonPath: string = `${repoPath}/rush.json`;
      const rushJson: Record<string, unknown> = await JsonFile.loadAsync(rushJsonPath);
      rushJson.pnpmVersion = '10.12.1';
      await JsonFile.saveAsync(rushJson, rushJsonPath, { updateExistingFile: true });

      const commonPnpmConfigPath: string = `${repoPath}/common/config/rush/pnpm-config.json`;
      const commonPnpmConfigJson: Record<string, unknown> = await JsonFile.loadAsync(commonPnpmConfigPath);
      if (options.pnpmStore) {
        commonPnpmConfigJson.pnpmStore = options.pnpmStore;
      } else {
        delete commonPnpmConfigJson.pnpmStore;
      }
      await JsonFile.saveAsync(commonPnpmConfigJson, commonPnpmConfigPath, { updateExistingFile: true });

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      await FileSystem.ensureFolderAsync(rushConfiguration.defaultSubspace.getSubspaceTempFolderPath());
      return rushConfiguration;
    }

    function createInstallManager(rushConfiguration: RushConfiguration): TestWorkspaceInstallManager {
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      const options: IInstallManagerOptions = {
        debug: false,
        allowShrinkwrapUpdates: true,
        checkOnly: false,
        bypassPolicy: false,
        noLink: false,
        fullUpgrade: false,
        recheckShrinkwrap: false,
        offline: false,
        networkConcurrency: undefined,
        collectLogFile: false,
        variant: undefined,
        maxInstallAttempts: 1,
        pnpmFilterArgumentValues: [],
        selectedProjects: new Set(rushConfiguration.projects),
        subspace: rushConfiguration.defaultSubspace,
        terminal
      };
      const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();

      return new TestWorkspaceInstallManager(
        rushConfiguration,
        rushGlobalFolder,
        new PurgeManager(rushConfiguration, rushGlobalFolder),
        options
      );
    }

    it('writes enableGlobalVirtualStore through the workspace install prepare path', async () => {
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] = '1';
      EnvironmentConfiguration.reset();
      const rushConfiguration: RushConfiguration = await prepareFixtureRepoAsync({ pnpmStore: 'global' });
      const installManager: TestWorkspaceInstallManager = createInstallManager(rushConfiguration);

      await installManager.prepareCommonTempForTestAsync(rushConfiguration.defaultSubspace);

      const workspaceYaml: string = await FileSystem.readFileAsync(
        `${rushConfiguration.defaultSubspace.getSubspaceTempFolderPath()}/pnpm-workspace.yaml`
      );
      expect(workspaceYaml).toContain('enableGlobalVirtualStore: true');
      expect(Path.convertToSlashes(workspaceYaml)).toContain('../../../a');
    });

    it('throws from the workspace install prepare path when using a worktree-local PNPM store', async () => {
      process.env[EnvironmentVariableNames.RUSH_PNPM_ENABLE_GLOBAL_VIRTUAL_STORE] = '1';
      EnvironmentConfiguration.reset();
      const rushConfiguration: RushConfiguration = await prepareFixtureRepoAsync({});
      const installManager: TestWorkspaceInstallManager = createInstallManager(rushConfiguration);

      expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
      expect(rushConfiguration.pnpmOptions.pnpmStorePath).not.toEqual('');

      await expect(
        installManager.prepareCommonTempForTestAsync(rushConfiguration.defaultSubspace)
      ).rejects.toThrow(
        `Set "pnpmStore" to "global" or use ${EnvironmentVariableNames.RUSH_PNPM_STORE_PATH}.`
      );
    });
  });
});
