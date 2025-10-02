// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem, Import, JsonFile, type IDependenciesMetaTable } from '@rushstack/node-core-library';
import { subspacePnpmfileShimFilename, scriptsFolderPath } from '../../utilities/PathConstants';

import type { ISubspacePnpmfileShimSettings, IWorkspaceProjectInfo } from './IPnpmfile';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { RushConstants } from '../RushConstants';
import type { Subspace } from '../../api/Subspace';
import type { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration';

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
    subspace: Subspace,
    variant: string | undefined
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const targetDir: string = subspace.getSubspaceTempFolderPath();
    const subspaceGlobalPnpmfilePath: string = path.join(targetDir, RushConstants.pnpmfileGlobalFilename);

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: `${scriptsFolderPath}/${subspacePnpmfileShimFilename}`,
      destinationPath: subspaceGlobalPnpmfilePath
    });

    const subspaceGlobalPnpmfileShimSettings: ISubspacePnpmfileShimSettings =
      SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings(rushConfiguration, subspace, variant);

    // Write the settings file used by the shim
    await JsonFile.saveAsync(
      subspaceGlobalPnpmfileShimSettings,
      path.join(targetDir, 'pnpmfileSettings.json'),
      {
        ensureFolderExists: true
      }
    );
  }

  public static getSubspacePnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    variant: string | undefined
  ): ISubspacePnpmfileShimSettings {
    const workspaceProjects: Record<string, IWorkspaceProjectInfo> = {};
    const subspaceProjects: Record<string, IWorkspaceProjectInfo> = {};

    const projectNameToInjectedDependenciesMap: Map<
      string,
      Set<string>
    > = SubspacePnpmfileConfiguration._getProjectNameToInjectedDependenciesMap(rushConfiguration, subspace);
    for (const project of rushConfiguration.projects) {
      const { packageName, projectRelativeFolder, packageJson } = project;
      const workspaceProjectInfo: IWorkspaceProjectInfo = {
        packageName,
        projectRelativeFolder,
        packageVersion: packageJson.version,
        injectedDependencies: Array.from(projectNameToInjectedDependenciesMap.get(packageName) || [])
      };
      (subspace.contains(project) ? subspaceProjects : workspaceProjects)[packageName] = workspaceProjectInfo;
    }

    const settings: ISubspacePnpmfileShimSettings = {
      workspaceProjects,
      subspaceProjects,
      semverPath: Import.resolveModule({ modulePath: 'semver', baseFolderPath: __dirname })
    };

    // common/config/subspaces/<subspace_name>/.pnpmfile.cjs
    const userPnpmfilePath: string = path.join(
      subspace.getVariantDependentSubspaceConfigFolderPath(variant),
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).pnpmfileFilename
    );
    if (FileSystem.exists(userPnpmfilePath)) {
      settings.userPnpmfilePath = userPnpmfilePath;
    }

    return settings;
  }

  private static _getProjectNameToInjectedDependenciesMap(
    rushConfiguration: RushConfiguration,
    subspace: Subspace
  ): Map<string, Set<string>> {
    const projectNameToInjectedDependenciesMap: Map<string, Set<string>> = new Map();

    const workspaceProjectsMap: Map<string, RushConfigurationProject> = new Map();
    const subspaceProjectsMap: Map<string, RushConfigurationProject> = new Map();
    for (const project of rushConfiguration.projects) {
      if (subspace.contains(project)) {
        subspaceProjectsMap.set(project.packageName, project);
      } else {
        workspaceProjectsMap.set(project.packageName, project);
      }

      projectNameToInjectedDependenciesMap.set(project.packageName, new Set());
    }

    const processTransitiveInjectedInstallQueue: Array<RushConfigurationProject> = [];

    for (const subspaceProject of subspaceProjectsMap.values()) {
      const injectedDependencySet: Set<string> = new Set();
      const dependenciesMeta: IDependenciesMetaTable | undefined =
        subspaceProject.packageJson.dependenciesMeta;
      if (dependenciesMeta) {
        for (const [dependencyName, { injected }] of Object.entries(dependenciesMeta)) {
          if (injected) {
            injectedDependencySet.add(dependencyName);
            projectNameToInjectedDependenciesMap.get(subspaceProject.packageName)?.add(dependencyName);

            //if this dependency is in the same subspace, leave as it is, PNPM will handle it
            //if this dependency is in another subspace, then it is transitive injected installation
            //so, we need to let all the workspace dependencies along the dependency chain to use injected installation
            if (!subspaceProjectsMap.has(dependencyName)) {
              processTransitiveInjectedInstallQueue.push(workspaceProjectsMap.get(dependencyName)!);
            }
          }
        }
      }

      // if alwaysInjectDependenciesFromOtherSubspaces policy is true in pnpm-config.json
      // and the dependency is not injected yet
      // and the dependency is in another subspace
      // then, make this dependency as injected dependency
      const pnpmOptions: PnpmOptionsConfiguration | undefined =
        subspace.getPnpmOptions() || rushConfiguration.pnpmOptions;
      if (pnpmOptions && pnpmOptions.alwaysInjectDependenciesFromOtherSubspaces) {
        const dependencyProjects: ReadonlySet<RushConfigurationProject> = subspaceProject.dependencyProjects;
        for (const dependencyProject of dependencyProjects) {
          const dependencyName: string = dependencyProject.packageName;
          if (!injectedDependencySet.has(dependencyName) && !subspaceProjectsMap.has(dependencyName)) {
            projectNameToInjectedDependenciesMap.get(subspaceProject.packageName)?.add(dependencyName);
            // process transitive injected installation
            processTransitiveInjectedInstallQueue.push(workspaceProjectsMap.get(dependencyName)!);
          }
        }
      }
    }

    // rewrite all workspace dependencies to injected install all for transitive injected installation case
    while (processTransitiveInjectedInstallQueue.length > 0) {
      const currentProject: RushConfigurationProject | undefined =
        processTransitiveInjectedInstallQueue.shift();
      const dependencies: Record<string, string> | undefined = currentProject?.packageJson?.dependencies;
      const optionalDependencies: Record<string, string> | undefined =
        currentProject?.packageJson?.optionalDependencies;
      if (currentProject) {
        if (dependencies) {
          SubspacePnpmfileConfiguration._processDependenciesForTransitiveInjectedInstall(
            projectNameToInjectedDependenciesMap,
            processTransitiveInjectedInstallQueue,
            dependencies,
            currentProject,
            rushConfiguration
          );
        }
        if (optionalDependencies) {
          SubspacePnpmfileConfiguration._processDependenciesForTransitiveInjectedInstall(
            projectNameToInjectedDependenciesMap,
            processTransitiveInjectedInstallQueue,
            optionalDependencies,
            currentProject,
            rushConfiguration
          );
        }
      }
    }

    return projectNameToInjectedDependenciesMap;
  }

  private static _processDependenciesForTransitiveInjectedInstall(
    projectNameToInjectedDependencies: Map<string, Set<string>>,
    processTransitiveInjectedInstallQueue: Array<RushConfigurationProject>,
    dependencies: Record<string, string>,
    currentProject: RushConfigurationProject,
    rushConfiguration: RushConfiguration
  ): void {
    for (const dependencyName in dependencies) {
      if (dependencies[dependencyName].startsWith('workspace:')) {
        projectNameToInjectedDependencies.get(currentProject.packageName)?.add(dependencyName);
        const nextProject: RushConfigurationProject | undefined =
          rushConfiguration.getProjectByName(dependencyName);
        if (nextProject) {
          processTransitiveInjectedInstallQueue.push(nextProject);
        }
      }
    }
  }
}
