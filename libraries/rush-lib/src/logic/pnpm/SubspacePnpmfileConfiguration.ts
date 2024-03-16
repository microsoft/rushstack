// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Import, JsonFile } from '@rushstack/node-core-library';
import { subspacePnpmfileShimFilename, scriptsFolderPath } from '../../utilities/PathConstants';

import type { ISubspacePnpmfileShimSettings, IWorkspaceProjectInfo } from './IPnpmfile';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { RushConstants } from '../RushConstants';
import type { Subspace } from '../../api/Subspace';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IDependenciesMetaTable } from '@rushstack/node-core-library';

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files,
 * optionally utilizing a pnpmfile shim to inject preferred versions.
 */
export class SubspacePnpmfileConfiguration {
  /**
   * Split workspace use global pnpmfile, because in split workspace, user may set `shared-workspace-lockfile=false`.
   * That means each project owns their individual pnpmfile under project folder. While the global pnpmfile could be
   * under the common/temp-split/ folder and be used by all split workspace projects.
   */
  public static async writeCommonTempSubspaceGlobalPnpmfileAsync(
    rushConfiguration: RushConfiguration,
    subspace: Subspace
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const targetDir: string = subspace.getSubspaceTempFolder();
    const subspaceGlobalPnpmfilePath: string = path.join(targetDir, RushConstants.pnpmfileGlobalFilename);

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: `${scriptsFolderPath}/${subspacePnpmfileShimFilename}`,
      destinationPath: subspaceGlobalPnpmfilePath
    });

    const subspaceGlobalPnpmfileShimSettings: ISubspacePnpmfileShimSettings =
      SubspacePnpmfileConfiguration._getSubspacePnpmfileShimSettings(rushConfiguration, subspace);

    // Write the settings file used by the shim
    await JsonFile.saveAsync(
      subspaceGlobalPnpmfileShimSettings,
      path.join(targetDir, 'pnpmfileSettings.json'),
      {
        ensureFolderExists: true
      }
    );
  }

  private static _getSubspacePnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    subspace: Subspace
  ): ISubspacePnpmfileShimSettings {
    const workspaceProjects: Record<string, IWorkspaceProjectInfo> = {};
    const subspaceProjects: Record<string, IWorkspaceProjectInfo> = {};

    const projectNameToIsInjectedInstallMap: Map<string, boolean> =
      SubspacePnpmfileConfiguration._getProjectNameToIsInjectedInstallMap(rushConfiguration, subspace);
    for (const project of rushConfiguration.projects) {
      const { packageName, projectFolder, projectRelativeFolder, packageJson } = project;
      const workspaceProjectInfo: IWorkspaceProjectInfo = {
        packageName,
        projectFolder,
        projectRelativeFolder,
        packageVersion: packageJson.version,
        isInjectedInstall: Boolean(projectNameToIsInjectedInstallMap.get(packageName))
      };
      (subspace.contains(project) ? subspaceProjects : workspaceProjects)[packageName] = workspaceProjectInfo;
    }

    const settings: ISubspacePnpmfileShimSettings = {
      workspaceProjects,
      subspaceProjects,
      semverPath: Import.resolveModule({ modulePath: 'semver', baseFolderPath: __dirname })
    };

    const userPnpmfilePath: string = path.join(
      subspace.getSubspaceConfigFolder(),
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).subspacePnpmfileFilename
    );
    if (FileSystem.exists(userPnpmfilePath)) {
      settings.userPnpmfilePath = userPnpmfilePath;
    }

    return settings;
  }

  private static _getProjectNameToIsInjectedInstallMap(
    rushConfiguration: RushConfiguration,
    subspace: Subspace
  ): Map<string, boolean> {
    const projectNameToIsInjectedInstallMap: Map<string, boolean> = new Map();

    const workspaceProjectsMap: Map<string, RushConfigurationProject> = new Map();
    const subspaceProjectsMap: Map<string, RushConfigurationProject> = new Map();
    for (const project of rushConfiguration.projects) {
      if (subspace.contains(project)) {
        subspaceProjectsMap.set(project.packageName, project);
      } else {
        workspaceProjectsMap.set(project.packageName, project);
      }
    }

    const processTransitiveInjectedInstallQueue: Array<RushConfigurationProject> = [];

    for (const subspaceProject of subspaceProjectsMap.values()) {
      const dependenciesMeta: IDependenciesMetaTable | undefined =
        subspaceProject.packageJson.dependenciesMeta;
      for (const dependencyName in dependenciesMeta) {
        if (dependenciesMeta[dependencyName]?.injected) {
          projectNameToIsInjectedInstallMap.set(dependencyName, true);

          //if this dependency is in the same subspace, leave as it is, PNPM will handle it
          //if this dependency is in another subspace, then it is transitive injected installation
          //so, we need to let all the workspace dependencies along the dependency chain to use injected installation
          if (!subspaceProjectsMap.has(dependencyName)) {
            processTransitiveInjectedInstallQueue.push(workspaceProjectsMap.get(dependencyName)!);
          }
        }
      }
    }

    while (processTransitiveInjectedInstallQueue.length > 0) {
      const currentProject: RushConfigurationProject | undefined =
        processTransitiveInjectedInstallQueue.shift();
      const dependencies: Record<string, string> | undefined = currentProject?.packageJson.dependencies;
      const devDependencies: Record<string, string> | undefined = currentProject?.packageJson.devDependencies;

      // handle dependencies
      for (const dependencyName in dependencies) {
        if (dependencies[dependencyName].startsWith('workspace:')) {
          projectNameToIsInjectedInstallMap.set(dependencyName, true);
          const nextProject: RushConfigurationProject | undefined =
            rushConfiguration.getProjectByName(dependencyName);
          if (nextProject) {
            processTransitiveInjectedInstallQueue.push(nextProject);
          }
        }
      }

      // handle devDependencies
      for (const dependencyName in devDependencies) {
        if (devDependencies[dependencyName].startsWith('workspace:')) {
          projectNameToIsInjectedInstallMap.set(dependencyName, true);
          const nextProject: RushConfigurationProject | undefined =
            rushConfiguration.getProjectByName(dependencyName);
          if (nextProject) {
            processTransitiveInjectedInstallQueue.push(nextProject);
          }
        }
      }
    }

    return projectNameToIsInjectedInstallMap;
  }
}
