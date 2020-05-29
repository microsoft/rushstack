// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from "path";
import * as resolve from "resolve";
import * as fsx from "fs-extra";
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
import { SymlinkAnalyzer, ILinkInfo } from './SymlinkAnalyzer';
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

  private _targetRootFolder: string;
  private _sourceRootFolder: string;

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

  private _loadConfigFile(scenarioName: string): void {
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

      for (const name of Object.keys(packageJson.dependencies || {})) {
        allDependencyNames.add(name);
      }
      for (const name of Object.keys(packageJson.peerDependencies || {})) {
        allDependencyNames.add(name);
      }
      for (const name of Object.keys(packageJson.optionalDependencies || {})) {
        allDependencyNames.add(name);
        optionalDependencyNames.add(name);
      }

      for (const dependencyPackageName of allDependencyNames) {
        const resolvedDependency: string = resolve.sync(dependencyPackageName, {
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
              const resolvedPath: string = require("fs").realpathSync(filePath);

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

        const dependencyPackageJsonPath: string | undefined
          = this._packageJsonLookup.tryGetPackageJsonFilePathFor(resolvedDependency);
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

  private _remapPathForDeployFolder(absolutePathInSourceFolder: string): string {

    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, this._sourceRootFolder)) {
      throw new Error("Source path is not under " + this._sourceRootFolder + "\n" + absolutePathInSourceFolder);
    }
    const relativePath: string = path.relative(this._sourceRootFolder, absolutePathInSourceFolder);
    const absolutePathInTargetFolder: string = path.join(this._targetRootFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  private _deployFolder(sourceFolderPath: string): void {

    const targetFolderPath: string = this._remapPathForDeployFolder(sourceFolderPath);

    // When copying a package folder, we always ignore the node_modules folder; it will be added indirectly
    // only if needed
    const pathToIgnore: string = path.join(sourceFolderPath, "node_modules");

    fsx.copySync(sourceFolderPath, targetFolderPath, {
      overwrite: false,
      errorOnExist: true,
      filter: (src: string, dest: string) => {
        if (Path.isUnderOrEqual(src, pathToIgnore)) {
          return false;
        }

        const stats: FileSystemStats = FileSystem.getLinkStatistics(src);
        if (stats.isSymbolicLink()) {
          this._symlinkAnalyzer.analyzePath(src);
          return false;
        }

        return true;
      },
    });
  }

  private _deploySymlink(originalLinkInfo: ILinkInfo): boolean {
    const linkInfo: ILinkInfo = {
      kind: originalLinkInfo.kind,
      linkPath: this._remapPathForDeployFolder(originalLinkInfo.linkPath),
      targetPath: this._remapPathForDeployFolder(originalLinkInfo.targetPath),
    };

    // Has the link target been created yet?  If not, we should try again later
    if (!FileSystem.exists(linkInfo.targetPath)) {
      return false;
    }

    const newLinkFolder: string = path.dirname(linkInfo.linkPath);
    FileSystem.ensureFolder(newLinkFolder);

    // Link to the relative path for symlinks
    const relativeTargetPath: string = path.relative(FileSystem.getRealPath(newLinkFolder), linkInfo.targetPath);

    // NOTE: This logic is based on NpmLinkManager._createSymlink()
    if (process.platform === "win32") {
      if (linkInfo.kind === "folderLink") {
        // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
        FileSystem.createSymbolicLinkJunction({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath,
        });
      } else {
        // For files, we use a Windows "hard link", because creating a symbolic link requires
        // administrator permission.

        // NOTE: We cannot use the relative path for hard links
        FileSystem.createHardLink({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath,
        });
      }
    } else {
      // However hard links seem to cause build failures on Mac, so for all other operating systems
      // we use symbolic links for this case.
      if (linkInfo.kind === "folderLink") {
        FileSystem.createSymbolicLinkFolder({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath,
        });
      } else {
        FileSystem.createSymbolicLinkFile({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath,
        });
      }
    }

    return true;
  }

  public deploy(scenarioName: string, overwriteExisting: boolean, targetFolderParameter: string | undefined): void {
    this._loadConfigFile(scenarioName);

    if (targetFolderParameter) {
      this._targetRootFolder = path.resolve(targetFolderParameter);
      if (!FileSystem.exists(this._targetRootFolder)) {
        throw new Error('The specified target folder does not exist: ' + JSON.stringify(targetFolderParameter));
      }
    } else {
      this._targetRootFolder = path.join(this._rushConfiguration.commonFolder, 'deploy');
    }
    this._sourceRootFolder = this._rushConfiguration.rushJsonFolder;

    console.log("Deploying to target folder: " + this._targetRootFolder);


    for (const includedProject of this._deployScenarioJson.includedProjects) {
      this._collectProject(includedProject);
    }

    Sort.sortSet(this._foldersToCopy);

    FileSystem.ensureFolder(this._targetRootFolder);

    // Is the target folder empty?
    if (FileSystem.readFolder(this._targetRootFolder).length > 0) {
      if (overwriteExisting) {
        console.log('Deleting folder contents because "--overwrite" was specified...');
        FileSystem.ensureEmptyFolder(this._targetRootFolder);
      } else {
        throw new Error('The deploy target folder is not empty. You can specify "--overwrite"'
          + ' to recursively delete all folder contents.');
      }
    }

    console.log("Copying folders");
    for (const folderToCopy of this._foldersToCopy) {
      this._deployFolder(folderToCopy);
    }

    console.log("Copying symlinks");
    const linksToCopy: ILinkInfo[] = this._symlinkAnalyzer.reportSymlinks();

    for (const linkToCopy of linksToCopy) {
      if (!this._deploySymlink(linkToCopy)) {
        throw new Error("Target does not exist: " + JSON.stringify(linkToCopy, undefined, 2));
      }
    }

    console.log("SUCCESS");
  }
}
