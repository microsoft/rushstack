// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This function will read the current directory and try to figure out if it's a rush project or regular pnpm workspace
// Currently it will throw error if neither can be determined

import { FileSystem, Path } from '@rushstack/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib/lib/api/RushConfiguration';
import type { Subspace } from '@microsoft/rush-lib/lib/api/Subspace';
import path from 'path';

import type { IAppState } from '../state';

export const init = (options: {
  lockfileExplorerProjectRoot: string;
  appVersion: string;
  debugMode: boolean;
  subspaceName: string;
}): Omit<IAppState, 'graph'> => {
  const { lockfileExplorerProjectRoot, appVersion, debugMode, subspaceName } = options;
  const currentWorkingDirectory: string = path.resolve(process.cwd());

  let appState: IAppState | undefined;
  let currentFolder: string = Path.convertToSlashes(currentWorkingDirectory);
  while (currentFolder.includes('/')) {
    // Look for a rush.json [rush project] or pnpm-lock.yaml file [regular pnpm workspace]
    const rushJsonPath: string = currentFolder + '/rush.json';
    const pnpmLockPath: string = currentFolder + '/pnpm-lock.yaml';
    if (FileSystem.exists(rushJsonPath)) {
      console.log('Found a Rush workspace: ', rushJsonPath);

      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
      const subspace: Subspace = rushConfiguration.getSubspace(subspaceName);
      const workspaceFolder: string = subspace.getSubspaceTempFolderPath();

      const pnpmLockfileAbsolutePath: string = path.resolve(workspaceFolder, 'pnpm-lock.yaml');
      const pnpmLockfileRelativePath: string = path.relative(currentFolder, pnpmLockfileAbsolutePath);
      appState = {
        currentWorkingDirectory,
        appVersion,
        debugMode,
        lockfileExplorerProjectRoot,
        pnpmLockfileLocation: pnpmLockfileAbsolutePath,
        pnpmfileLocation: workspaceFolder + '/.pnpmfile.cjs',
        projectRoot: currentFolder,
        lfxWorkspace: {
          workspaceRootFullPath: currentFolder,
          pnpmLockfilePath: Path.convertToSlashes(pnpmLockfileRelativePath),
          pnpmLockfileFolder: Path.convertToSlashes(path.basename(pnpmLockfileRelativePath)),
          rushConfig: {
            rushVersion: rushConfiguration.rushConfigurationJson.rushVersion,
            subspaceName: subspaceName ?? ''
          }
        }
      };
      break;
    } else if (FileSystem.exists(pnpmLockPath)) {
      appState = {
        currentWorkingDirectory,
        appVersion,
        debugMode,
        lockfileExplorerProjectRoot,
        pnpmLockfileLocation: currentFolder + '/pnpm-lock.yaml',
        pnpmfileLocation: currentFolder + '/.pnpmfile.cjs',
        projectRoot: currentFolder,
        lfxWorkspace: {
          workspaceRootFullPath: currentFolder,
          pnpmLockfilePath: Path.convertToSlashes(path.relative(currentFolder, pnpmLockPath)),
          pnpmLockfileFolder: '',
          rushConfig: undefined
        }
      };

      break;
    }

    currentFolder = currentFolder.substring(0, currentFolder.lastIndexOf('/'));
  }

  if (!appState) {
    throw new Error('Could not find a Rush or PNPM workspace!');
  }

  return appState;
};
