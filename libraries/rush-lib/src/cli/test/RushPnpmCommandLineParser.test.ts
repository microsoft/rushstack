// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { TestUtilities } from '@rushstack/heft-config-file';
import { RushConfiguration } from '../../api/RushConfiguration';

describe('RushPnpmCommandLineParser', () => {
  describe('catalog syncing', () => {
    let testRepoPath: string;
    let pnpmConfigPath: string;
    let pnpmWorkspacePath: string;

    beforeEach(() => {
      testRepoPath = path.join(__dirname, 'temp', 'catalog-sync-test-repo');
      FileSystem.ensureFolder(testRepoPath);

      const rushJsonPath: string = path.join(testRepoPath, 'rush.json');
      const rushJson = {
        $schema: 'https://developer.microsoft.com/json-schemas/rush/v5/rush.schema.json',
        rushVersion: '5.166.0',
        pnpmVersion: '10.28.1',
        nodeSupportedVersionRange: '>=18.0.0',
        projects: []
      };
      JsonFile.save(rushJson, rushJsonPath, { ensureFolderExists: true });

      const configDir: string = path.join(testRepoPath, 'common', 'config', 'rush');
      FileSystem.ensureFolder(configDir);

      pnpmConfigPath = path.join(configDir, 'pnpm-config.json');
      const pnpmConfig = {
        globalCatalogs: {
          default: {
            react: '^18.0.0',
            'react-dom': '^18.0.0'
          }
        }
      };
      JsonFile.save(pnpmConfig, pnpmConfigPath);

      const tempDir: string = path.join(testRepoPath, 'common', 'temp');
      FileSystem.ensureFolder(tempDir);

      pnpmWorkspacePath = path.join(tempDir, 'pnpm-workspace.yaml');
      const workspaceYaml = `packages:
  - '../../apps/*'
catalogs:
  default:
    react: ^18.0.0
    react-dom: ^18.0.0
`;
      FileSystem.writeFile(pnpmWorkspacePath, workspaceYaml);
    });

    afterEach(() => {
      if (FileSystem.exists(testRepoPath)) {
        FileSystem.deleteFolder(testRepoPath);
      }
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
      FileSystem.writeFile(pnpmWorkspacePath, updatedWorkspaceYaml);

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(testRepoPath, 'rush.json')
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

      pnpmOptions?.updateGlobalCatalogs(newCatalogs);

      const updatedRushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(testRepoPath, 'rush.json')
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
        path.join(testRepoPath, 'rush.json')
      );
      const subspace = rushConfiguration.getSubspace('default');
      const pnpmOptions = subspace.getPnpmOptions();

      pnpmOptions?.updateGlobalCatalogs(newCatalogs);

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
      FileSystem.writeFile(pnpmWorkspacePath, workspaceWithoutCatalogs);

      const { PnpmWorkspaceFile } = require('../../logic/pnpm/PnpmWorkspaceFile');
      const newCatalogs = await PnpmWorkspaceFile.loadCatalogsFromFileAsync(pnpmWorkspacePath);

      expect(newCatalogs).toBeUndefined();

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(testRepoPath, 'rush.json')
      );
      const subspace = rushConfiguration.getSubspace('default');
      const pnpmOptions = subspace.getPnpmOptions();

      pnpmOptions?.updateGlobalCatalogs(newCatalogs);

      const updatedRushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.join(testRepoPath, 'rush.json')
      );
      const updatedSubspace = updatedRushConfiguration.getSubspace('default');
      const updatedPnpmOptions = updatedSubspace.getPnpmOptions();

      expect(updatedPnpmOptions?.globalCatalogs).toBeUndefined();
    });
  });
});
