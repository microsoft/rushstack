// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from "path";
import * as resolve from "resolve";
import * as npmPacklist from 'npm-packlist';
import ignore, { Ignore } from 'ignore';
import {
  Path,
  FileSystem,
  PackageJsonLookup,
  FileSystemStats,
  Sort,
  JsonFile,
  JsonSchema,
  IPackageJson,
  AlreadyExistsBehavior
} from "@rushstack/node-core-library";
import { RushConfiguration } from '../../api/RushConfiguration';
import { SymlinkAnalyzer, ILinkInfo } from './SymlinkAnalyzer';
import { RushConfigurationProject } from "../../api/RushConfigurationProject";

// (@types/npm-packlist is missing this API)
declare module "npm-packlist" {
  export class WalkerSync {
    public readonly result: string[];
    public constructor(opts: { path: string });
    public start(): void;
  }
}

interface IDeployScenarioProjectJson {
  projectName: string;
  subdeploymentFolderName?: string;
  additionalProjectsToInclude?: string[];
}

interface IDeployScenarioJson {
  deploymentProjectNames: string[],
  enableSubdeployments?: boolean;
  includeDevDependencies?: boolean;
  includeNpmIgnoreFiles?: boolean;
  symlinkCreation?: "default" | "script" | "none";
  projectSettings?: IDeployScenarioProjectJson[];
}

interface IFolderInfo {
  folderPath: string;
  isRushProject: boolean;
}

interface ISubdeploymentState {
  targetSubdeploymentFolder: string;
  symlinkAnalyzer: SymlinkAnalyzer;
  foldersToCopy: Set<string>;
  folderInfosByPath: Map<string, IFolderInfo>;
}

export class DeployManager {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../../schemas/deploy-scenario.schema.json')
  );

  private static _scenarioNameRegExp: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  private readonly _rushConfiguration: RushConfiguration;

  private _targetRootFolder: string;
  private _sourceRootFolder: string;

  private readonly _packageJsonLookup: PackageJsonLookup;

  private _deployScenarioJson: IDeployScenarioJson;
  private _deployScenarioProjectJsonsByName: Map<string, IDeployScenarioProjectJson>;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._packageJsonLookup = new PackageJsonLookup();
    this._deployScenarioProjectJsonsByName = new Map();
  }

  public static validateScenarioName(scenarioName: string): void {
    if (!scenarioName) {
      throw new Error('The scenario name cannot be an empty string');
    }
    if (!this._scenarioNameRegExp.test(scenarioName)) {
      throw new Error(`"${scenarioName}" is not a valid scenario name. The name must be comprised of`
        + ' lower case letters and numbers, separated by single hyphens. Example: "my-scenario"');
    }
  }

  private _loadConfigFile(scenarioName: string): void {
    const deployScenarioPath: string = path.join(this._rushConfiguration.commonFolder, 'config/deploy-scenarios',
      scenarioName + '.json');

    if (!FileSystem.exists(deployScenarioPath)) {
      throw new Error('The scenario config file was not found: ' + deployScenarioPath);
    }

    console.log('Loading deployment scenario from: '
      + path.relative(this._rushConfiguration.commonFolder, deployScenarioPath))

    this._deployScenarioJson = JsonFile.loadAndValidate(deployScenarioPath, DeployManager._jsonSchema);

    for (const projectSetting of this._deployScenarioJson.projectSettings || []) {
      // Validate projectSetting.projectName
      if (!this._rushConfiguration.getProjectByName(projectSetting.projectName)) {
        throw new Error(`The "projectSettings" section refers to the project name "${projectSetting.projectName}"` +
          ` which was not found in rush.json`);
      }
      for (const additionalProjectsToInclude of projectSetting.additionalProjectsToInclude || []) {
        if (!this._rushConfiguration.getProjectByName(projectSetting.projectName)) {
          throw new Error(`The "additionalProjectsToInclude" setting refers to the` +
            ` project name "${additionalProjectsToInclude}" which was not found in rush.json`);
        }
      }
      this._deployScenarioProjectJsonsByName.set(projectSetting.projectName, projectSetting);
    }
  }

  private _collectFoldersRecursive(packageJsonPath: string, subdemploymentState: ISubdeploymentState): void {
    const packageJsonFolderPath: string = path.dirname(packageJsonPath);

    if (!subdemploymentState.foldersToCopy.has(packageJsonFolderPath)) {
      subdemploymentState.foldersToCopy.add(packageJsonFolderPath);

      const packageJson: IPackageJson = JsonFile.load(packageJsonPath);

      // Union of keys from regular dependencies, peerDependencies, and optionalDependencies
      const allDependencyNames: Set<string> = new Set<string>();
      // Just the keys from optionalDependencies
      const optionalDependencyNames: Set<string> = new Set<string>();

      for (const name of Object.keys(packageJson.dependencies || {})) {
        allDependencyNames.add(name);
      }
      if (this._deployScenarioJson.includeDevDependencies) {
        for (const name of Object.keys(packageJson.devDependencies || {})) {
          allDependencyNames.add(name);
        }
      }
      for (const name of Object.keys(packageJson.peerDependencies || {})) {
        allDependencyNames.add(name);
        optionalDependencyNames.add(name); // consider peers optional, since they are so frequently broken
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

              subdemploymentState.symlinkAnalyzer.analyzePath(filePath);
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

        this._collectFoldersRecursive(dependencyPackageJsonPath, subdemploymentState);
      }
    }
  }

  private _remapPathForDeployFolder(absolutePathInSourceFolder: string,
    subdemploymentState: ISubdeploymentState): string {

    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, this._sourceRootFolder)) {
      throw new Error("Source path is not under " + this._sourceRootFolder + "\n" + absolutePathInSourceFolder);
    }
    const relativePath: string = path.relative(this._sourceRootFolder, absolutePathInSourceFolder);
    const absolutePathInTargetFolder: string = path.join(subdemploymentState.targetSubdeploymentFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  private _deployFolder(sourceFolderPath: string, subdemploymentState: ISubdeploymentState): void {

    let useNpmIgnoreFilter: boolean = false;

    if (!this._deployScenarioJson.includeNpmIgnoreFiles) {
      const sourceFolderInfo: IFolderInfo | undefined
        = subdemploymentState.folderInfosByPath.get(FileSystem.getRealPath(sourceFolderPath));
      if (sourceFolderInfo) {
        if (sourceFolderInfo.isRushProject) {
          useNpmIgnoreFilter = true;
        }
      }
    }

    const targetFolderPath: string = this._remapPathForDeployFolder(sourceFolderPath, subdemploymentState);

    if (useNpmIgnoreFilter) {
      // Use npm-packlist to filter the files.  Using the WalkerSync class (instead of the sync() API) ensures
      // that "bundledDependencies" are not included.
      const walker: npmPacklist.WalkerSync = new npmPacklist.WalkerSync({
        path: sourceFolderPath
      });
      walker.start();
      const npmPackFiles: string[] = walker.result;

      for (const npmPackFile of npmPackFiles) {
        const copySourcePath: string = path.join(sourceFolderPath, npmPackFile);
        const copyDestinationPath: string = path.join(targetFolderPath, npmPackFile);

        if (subdemploymentState.symlinkAnalyzer.analyzePath(copySourcePath).kind !== "link") {
          FileSystem.ensureFolder(path.dirname(copyDestinationPath));

          FileSystem.copyFile({
            sourcePath: copySourcePath,
            destinationPath: copyDestinationPath,
            alreadyExistsBehavior: AlreadyExistsBehavior.Error
          });
        }
      }
    } else {
      // use a simplistic "ignore" ruleset to filter the files
      const ignoreFilter: Ignore = ignore();
      ignoreFilter.add([
        // The top-level node_modules folder is always excluded
        '/node_modules',
        // Also exclude well-known folders that can contribute a lot of unnecessary files
        '**/.git',
        '**/.svn',
        '**/.hg',
        '**/.DS_Store'
      ]);

      FileSystem.copyFiles({
        sourcePath: sourceFolderPath,
        destinationPath: targetFolderPath,
        alreadyExistsBehavior: AlreadyExistsBehavior.Error,
        filter: (src: string, dest: string) => {
          const relativeSrc: string = path.relative(sourceFolderPath, src);
          if (!relativeSrc) {
            return true;  // don't filter sourceFolderPath itself
          }

          if (ignoreFilter.ignores(relativeSrc)) {
            return false;
          }

          const stats: FileSystemStats = FileSystem.getLinkStatistics(src);
          if (stats.isSymbolicLink()) {
            subdemploymentState.symlinkAnalyzer.analyzePath(src);
            return false;
          } else {
            return true;
          }
        }
      });
    }
  }

  private _deploySymlink(originalLinkInfo: ILinkInfo, subdemploymentState: ISubdeploymentState): boolean {
    const linkInfo: ILinkInfo = {
      kind: originalLinkInfo.kind,
      linkPath: this._remapPathForDeployFolder(originalLinkInfo.linkPath, subdemploymentState),
      targetPath: this._remapPathForDeployFolder(originalLinkInfo.targetPath, subdemploymentState),
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

  private _deploySubdeployment(includedProjectNames: string[], subdeploymentFolderName: string | undefined): void {
    // Include the additionalProjectsToInclude
    const includedProjectNamesSet: Set<string> = new Set();
    for (const projectName of includedProjectNames) {
      includedProjectNamesSet.add(projectName);

      const projectSettings: IDeployScenarioProjectJson | undefined
        = this._deployScenarioProjectJsonsByName.get(projectName);
      if (projectSettings && projectSettings.additionalProjectsToInclude) {
        for (const additionalProjectToInclude of projectSettings.additionalProjectsToInclude) {
          includedProjectNamesSet.add(additionalProjectToInclude);
        }
      }
    }

    const subdemploymentState: ISubdeploymentState = {
      targetSubdeploymentFolder: path.join(this._targetRootFolder, subdeploymentFolderName || ''),
      symlinkAnalyzer: new SymlinkAnalyzer(),
      foldersToCopy: new Set(),
      folderInfosByPath: new Map()
    };

    for (const rushProject of this._rushConfiguration.projects) {
      const projectFolder: string = FileSystem.getRealPath(rushProject.projectFolder);
      subdemploymentState.folderInfosByPath.set(projectFolder, {
        folderPath: projectFolder,
        isRushProject: true
      });
    }

    for (const projectName of includedProjectNamesSet) {
      console.log(`Analyzing project "${projectName}"`);
      const project: RushConfigurationProject | undefined = this._rushConfiguration.getProjectByName(projectName);

      if (!project) {
        throw new Error(`The project ${projectName} is not defined in rush.json`);
      }

      this._collectFoldersRecursive(path.join(project.projectFolder, 'package.json'), subdemploymentState);
    }

    Sort.sortSet(subdemploymentState.foldersToCopy);

    console.log("Copying folders...");
    for (const folderToCopy of subdemploymentState.foldersToCopy) {
      this._deployFolder(folderToCopy, subdemploymentState);
    }

    console.log("Copying symlinks...");
    const linksToCopy: ILinkInfo[] = subdemploymentState.symlinkAnalyzer.reportSymlinks();

    for (const linkToCopy of linksToCopy) {
      if (!this._deploySymlink(linkToCopy, subdemploymentState)) {
        throw new Error("Target does not exist: " + JSON.stringify(linkToCopy, undefined, 2));
      }
    }
  }

  public deployScenario(scenarioName: string, overwriteExisting: boolean,
    targetFolderParameter: string | undefined): void {

    DeployManager.validateScenarioName(scenarioName);

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

    // The JSON schema ensures this array has at least one item
    const deploymentProjectNames: string[] = this._deployScenarioJson.deploymentProjectNames;

    if (this._deployScenarioJson.enableSubdeployments) {
      const usedSubdeploymentFolderNames: Set<string> = new Set();

      for (const subdeploymentProjectName of deploymentProjectNames) {
        const rushProject: RushConfigurationProject | undefined =
          this._rushConfiguration.getProjectByName(subdeploymentProjectName);
        if (!rushProject) {
          throw new Error(`The "deploymentProjectNames" setting specified the name "${subdeploymentProjectName}"` +
            ` which was not found in rush.json`);
        }

        let subdeploymentFolderName: string;

        const projectSettings: IDeployScenarioProjectJson | undefined
          = this._deployScenarioProjectJsonsByName.get(subdeploymentProjectName);
        if (projectSettings && projectSettings.subdeploymentFolderName) {
          subdeploymentFolderName = projectSettings.subdeploymentFolderName;
        } else {
          subdeploymentFolderName = this._rushConfiguration.packageNameParser.getUnscopedName(subdeploymentProjectName);
        }
        if (usedSubdeploymentFolderNames.has(subdeploymentFolderName)) {
          throw new Error(`The subdeployment folder name "${subdeploymentFolderName}" is not unique.`
            + `  Use the "subdeploymentFolderName" setting to specify a different name.`);
        }
        usedSubdeploymentFolderNames.add(subdeploymentFolderName);

        console.log(`\nPreparing subdeployment for "${subdeploymentFolderName}"`);

        this._deploySubdeployment([ subdeploymentProjectName ], subdeploymentFolderName);
      }
    } else {
      if (deploymentProjectNames.length !== 1) {
        throw new Error(`The "deploymentProjectNames" setting specifies specifies more than one project;`
          + ' this is not supported unless the "enableSubdeployments" setting is true.');
      }
      this._deploySubdeployment(deploymentProjectNames, undefined);
    }

    console.log("SUCCESS");
  }
}
