// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { TestUtilities } from '@rushstack/heft-config-file';
import { RushConfiguration } from '../../api/RushConfiguration';

const MONOREPO_ROOT: string = path.dirname(
  RushConfiguration.tryFindRushJsonLocation({ startingFolder: __dirname })!
);
const CATALOG_SYNC_REPO_PATH: string = `${__dirname}/catalogSyncTestRepo`;

describe('RushPnpmCommandLineParser', () => {
  describe('catalog syncing', () => {
    const testRepoPath: string = `${MONOREPO_ROOT}/temp/catalog-sync-test-repo`;
    const pnpmConfigPath: string = `${testRepoPath}/common/config/rush/pnpm-config.json`;
    const pnpmWorkspacePath: string = `${testRepoPath}/common/temp/pnpm-workspace.yaml`;

    beforeEach(async () => {
      await FileSystem.copyFilesAsync({ sourcePath: CATALOG_SYNC_REPO_PATH, destinationPath: testRepoPath });

      // common/temp is gitignored so it is not part of the static repo; copy the initial workspace file here
      await FileSystem.copyFilesAsync({
        sourcePath: `${CATALOG_SYNC_REPO_PATH}/pnpm-workspace.yaml`,
        destinationPath: pnpmWorkspacePath
      });
    });

    afterEach(async () => {
      await FileSystem.deleteFolderAsync(testRepoPath);
    });

    it('syncs updated catalogs from pnpm-workspace.yaml to pnpm-config.json', async () => {
      const updatedWorkspaceYaml = `packages:
  - '../../apps/*'
catalogs:
  default:
    react: ^18.2.0
    react-dom: ^18.2.0
    typescript: ~5.3.0
  frontend:
    vue: ^3.4.0
`;
      await FileSystem.writeFileAsync(pnpmWorkspacePath, updatedWorkspaceYaml);

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${testRepoPath}/rush.json`
      );

      const subspace = rushConfiguration.getSubspace('default');
      const pnpmOptions = subspace.getPnpmOptions();

      expect(TestUtilities.stripAnnotations(pnpmOptions?.globalCatalogs)).toEqual({
        default: {
          react: '^18.0.0',
          'react-dom': '^18.0.0'
        }
      });

      const { PnpmWorkspaceFile } = require('../../logic/pnpm/PnpmWorkspaceFile');
      const newCatalogs = await PnpmWorkspaceFile.loadCatalogsFromFileAsync(pnpmWorkspacePath);

      await pnpmOptions?.updateGlobalCatalogsAsync(newCatalogs);

      const updatedRushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${testRepoPath}/rush.json`
      );
      const updatedSubspace = updatedRushConfiguration.getSubspace('default');
      const updatedPnpmOptions = updatedSubspace.getPnpmOptions();

      expect(TestUtilities.stripAnnotations(updatedPnpmOptions?.globalCatalogs)).toEqual({
        default: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          typescript: '~5.3.0'
        },
        frontend: {
          vue: '^3.4.0'
        }
      });
    });

    it('does not update pnpm-config.json when catalogs are unchanged', async () => {
      const { PnpmWorkspaceFile } = require('../../logic/pnpm/PnpmWorkspaceFile');
      const newCatalogs = await PnpmWorkspaceFile.loadCatalogsFromFileAsync(pnpmWorkspacePath);

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${testRepoPath}/rush.json`
      );
      const subspace = rushConfiguration.getSubspace('default');
      const pnpmOptions = subspace.getPnpmOptions();

      await pnpmOptions?.updateGlobalCatalogsAsync(newCatalogs);

      const savedConfig = JsonFile.load(pnpmConfigPath);
      expect(savedConfig.globalCatalogs).toEqual({
        default: {
          react: '^18.0.0',
          'react-dom': '^18.0.0'
        }
      });
    });

    it('removes catalogs when pnpm-workspace.yaml has no catalogs', async () => {
      const workspaceWithoutCatalogs = `packages:
  - '../../apps/*'
`;
      await FileSystem.writeFileAsync(pnpmWorkspacePath, workspaceWithoutCatalogs);

      const { PnpmWorkspaceFile } = require('../../logic/pnpm/PnpmWorkspaceFile');
      const newCatalogs = await PnpmWorkspaceFile.loadCatalogsFromFileAsync(pnpmWorkspacePath);

      expect(newCatalogs).toBeUndefined();

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${testRepoPath}/rush.json`
      );
      const subspace = rushConfiguration.getSubspace('default');
      const pnpmOptions = subspace.getPnpmOptions();

      await pnpmOptions?.updateGlobalCatalogsAsync(newCatalogs);

      const updatedRushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${testRepoPath}/rush.json`
      );
      const updatedSubspace = updatedRushConfiguration.getSubspace('default');
      const updatedPnpmOptions = updatedSubspace.getPnpmOptions();

      expect(updatedPnpmOptions?.globalCatalogs).toBeUndefined();
    });
  });
});
