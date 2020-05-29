// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from "path";
import * as resolve from "resolve";
import {
  Path,
  FileSystem,
  PackageJsonLookup,
  FileSystemStats,
  Sort,
  JsonFile,
  IPackageJson,
} from "@rushstack/node-core-library";
import { RushConfiguration } from '../../api/RushConfiguration';
import { SymlinkAnalyzer } from './SymlinkAnalyzer';
import { RushConfigurationProject } from "../../api/RushConfigurationProject";

interface IDeployScenarioProjectJson {
  projectName: string;
}

interface IDeployScenarioJson {
  includeDevDependencies?: boolean;
  includeNpmIgnoreFiles?: boolean;
  includedProjects: IDeployScenarioProjectJson[];
}

export class DeployManager {
  private readonly _rushConfiguration: RushConfiguration;

  private readonly _packageJsonLookup: PackageJsonLookup;
  private readonly _symlinkAnalyzer: SymlinkAnalyzer;

  private readonly _foldersToCopy: Set<string>;

  private _deployScenarioJson: IDeployScenarioJson;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._packageJsonLookup = new PackageJsonLookup();
    this._symlinkAnalyzer = new SymlinkAnalyzer();
    this._foldersToCopy = new Set<string>();
  }

  private _loadConfigFile(scenarioName): void {
    const deployScenarioPath: string = path.join(this._rushConfiguration.commonFolder, 'config/deploy-scenarios',
      scenarioName + '.json');

    if (!FileSystem.exists(deployScenarioPath)) {
      throw new Error('The scenario config file was not found: ' + deployScenarioPath);
    }

    this._deployScenarioJson = JsonFile.load(deployScenarioPath);
  }

  private _collectFoldersRecursive(packageJsonPath: string): void {
    const packageJsonFolderPath: string = path.dirname(packageJsonPath);

    if (!this._foldersToCopy.has(packageJsonFolderPath)) {
      this._foldersToCopy.add(packageJsonFolderPath);

      const packageJson: IPackageJson = JsonFile.load(packageJsonPath);

      // Union of keys from regular dependencies, peerDependencies, and optionalDependencies
      const allDependencyNames: Set<string> = new Set<string>();
      // Just the keys from optionalDependencies
      const optionalDependencyNames: Set<string> = new Set<string>();

      for (const name in packageJson.dependencies || {}) {
        allDependencyNames.add(name);
      }
      for (const name in packageJson.peerDependencies || {}) {
        allDependencyNames.add(name);
      }
      for (const name in packageJson.optionalDependencies || {}) {
        allDependencyNames.add(name);
        optionalDependencyNames.add(name);
      }

      for (const dependencyPackageName of allDependencyNames) {
        const resolvedDependency = resolve.sync(dependencyPackageName, {
          basedir: packageJsonFolderPath,
          preserveSymlinks: false,
          packageFilter: (pkg, dir) => {
            // point "main" at a file that is guaranteed to exist
            // This helps resolve packages such as @types/node that have no entry point
            pkg.main = "./package.json";
            return pkg;
          },
          realpathSync: (filePath) => {
            try {
              const resolvedPath = require("fs").realpathSync(filePath);

              this._symlinkAnalyzer.analyzePath(filePath);
              return resolvedPath;
            } catch (realpathErr) {
              if (realpathErr.code !== "ENOENT") {
                throw realpathErr;
              }
            }
            return filePath;
          },
        });

        if (!resolvedDependency) {
          if (optionalDependencyNames.has(dependencyPackageName)) {
            // Ignore missing optional dependency
            continue;
          }
          throw new Error(`Error resolving ${dependencyPackageName} from ${packageJsonPath}`);
        }

        const dependencyPackageJsonPath = this._packageJsonLookup.tryGetPackageJsonFilePathFor(resolvedDependency);
        if (!dependencyPackageJsonPath) {
          throw new Error(`Error finding package.json for ${resolvedDependency}`);
        }

        this._collectFoldersRecursive(dependencyPackageJsonPath);
      }
    }
  }

  private _collectProject(scenarioProject: IDeployScenarioProjectJson): void {
    console.log('Analyzing ' + scenarioProject.projectName);
    const project: RushConfigurationProject | undefined
      = this._rushConfiguration.getProjectByName(scenarioProject.projectName);

    if (!project) {
      throw new Error(`The project ${scenarioProject.projectName} is not defined in rush.json`);
    }

    this._collectFoldersRecursive(path.join(project.projectFolder, 'package.json'));
  }

  public deploy(scenarioName: string, overwriteExisting: boolean, targetFolder: string | undefined) {
    this._loadConfigFile(scenarioName);

    for (const includedProject of this._deployScenarioJson.includedProjects) {
      this._collectProject(includedProject);
    }
  }
}
