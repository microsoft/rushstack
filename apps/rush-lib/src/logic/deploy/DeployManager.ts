// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
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
  AlreadyExistsBehavior,
  InternalError,
  NewlineKind,
  Text
} from '@rushstack/node-core-library';
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

// Describes IDeployScenarioJson.projectSettings
interface IDeployScenarioProjectJson {
  projectName: string;
  subdeploymentFolderName?: string;
  additionalProjectsToInclude?: string[];
}

// The parsed JSON file structure, as defined by the "deploy-scenario.schema.json" JSON schema
interface IDeployScenarioJson {
  deploymentProjectNames: string[],
  enableSubdeployments?: boolean;
  includeDevDependencies?: boolean;
  includeNpmIgnoreFiles?: boolean;
  linkCreation?: "default" | "script" | "none";
  projectSettings?: IDeployScenarioProjectJson[];
}

/**
 * The deploy-matadata.json file format.
 */
export interface IDeployMetadataJson {
  scenarioName: string;
  mainProjectName: string;
  links: ILinkInfo[];
}

/**
 * Stores additional information about folders being copied.
 * Only some of the ISubdeploymentState.foldersToCopy items will an IFolderInfo object.
 */
interface IFolderInfo {
  /**
   * This is the lookup key for ISubdeploymentState.folderInfosByPath.
   * It is an absolute real path.
   */
  folderPath: string;
  /**
   * True if this is the package folder for a local Rush project.
   */
  isRushProject: boolean;
}

/**
 * This object tracks DeployManager state that is different for each subdeployment.
 */
interface ISubdeploymentState {
  scenarioName: string;

  mainProjectName: string;

  /**
   * The absolute path of the target folder for the subdeployment. If enableSubdeployments=false,
   * then this points to the DeployManager._targetRootFolder.
   */
  targetSubdeploymentFolder: string;

  /**
   * During the analysis stage, _collectFoldersRecursive() uses this set to collect the absolute paths
   * of the package folders to be copied.  The copying is performed later by _deployFolder().
   */
  foldersToCopy: Set<string>;

  /**
   * Additional information about some of the foldersToCopy paths.
   * The key is the absolute real path from foldersToCopy.
   */
  folderInfosByPath: Map<string, IFolderInfo>;

  symlinkAnalyzer: SymlinkAnalyzer;
}

/**
 * Manages the business logic for the "rush deploy" command.
 */
export class DeployManager {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../../schemas/deploy-scenario.schema.json')
  );

  // Used by validateScenarioName()
  private static _scenarioNameRegExp: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  private readonly _rushConfiguration: RushConfiguration;
  private readonly _packageJsonLookup: PackageJsonLookup;

  /**
   * The target folder for the deployment.  By default it will be "common/deploy".
   */
  private _targetRootFolder: string;
  /**
   * The source folder that copying originates from.  Generally it is the repo root folder with rush.json.
   */
  private _sourceRootFolder: string;

  /**
   * The parsed scenario config file, as defined by the "deploy-scenario.schema.json" JSON schema
   */
  private _deployScenarioJson: IDeployScenarioJson;

  /**
   * Used to lookup items in IDeployScenarioJson.projectSettings based on their IDeployScenarioProjectJson.projectName
   */
  private _deployScenarioProjectJsonsByName: Map<string, IDeployScenarioProjectJson>;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._packageJsonLookup = new PackageJsonLookup();
    this._deployScenarioProjectJsonsByName = new Map();
  }

  /**
   * Validates that the input string conforms to the naming rules for a "rush deploy" scenario name.
   */
  public static validateScenarioName(scenarioName: string): void {
    if (!scenarioName) {
      throw new Error('The scenario name cannot be an empty string');
    }
    if (!this._scenarioNameRegExp.test(scenarioName)) {
      throw new Error(`"${scenarioName}" is not a valid scenario name. The name must be comprised of`
        + ' lower case letters and numbers, separated by single hyphens. Example: "my-scenario"');
    }
  }

  /**
   * Load and validate the scenario config file.  The result is stored in this._deployScenarioJson.
   */
  private _loadConfigFile(scenarioName: string): void {
    const deployScenarioPath: string = path.join(this._rushConfiguration.commonFolder, 'config/deploy-scenarios',
      scenarioName + '.json');

    if (!FileSystem.exists(deployScenarioPath)) {
      throw new Error('The scenario config file was not found: ' + deployScenarioPath);
    }

    console.log(colors.cyan('Loading deployment scenario: ') + deployScenarioPath)

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

  /**
   * Recursively crawl the node_modules dependencies and collect the result in ISubdeploymentState.foldersToCopy.
   */
  private _collectFoldersRecursive(packageJsonFolderPath: string, subdemploymentState: ISubdeploymentState): void {
    const packageJsonRealFolderPath: string = FileSystem.getRealPath(packageJsonFolderPath);

    if (!subdemploymentState.foldersToCopy.has(packageJsonRealFolderPath)) {
      subdemploymentState.foldersToCopy.add(packageJsonRealFolderPath);

      const packageJson: IPackageJson = JsonFile.load(path.join(packageJsonRealFolderPath, 'package.json'));

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
        // The "resolve" library models the Node.js require() API, which gives precedence to "core" system modules
        // over an NPM package with the same name.  But we are traversing package.json dependencies, which refer
        // to system modules.  Appending a "/" forces require() to load the NPM package.
        const resolveSuffix: string = dependencyPackageName + resolve.isCore(dependencyPackageName) ? '/' : '';

        const resolvedDependency: string = resolve.sync(dependencyPackageName + resolveSuffix, {
          basedir: packageJsonRealFolderPath,
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
          throw new Error(`Error resolving ${dependencyPackageName} from ${packageJsonRealFolderPath}`);
        }

        const dependencyPackageFolderPath: string | undefined
          = this._packageJsonLookup.tryGetPackageFolderFor(resolvedDependency);
        if (!dependencyPackageFolderPath) {
          throw new Error(`Error finding package.json folder for ${resolvedDependency}`);
        }

        this._collectFoldersRecursive(dependencyPackageFolderPath, subdemploymentState);
      }
    }
  }

  /**
   * Maps a file path from DeployManager._sourceRootFolder --> ISubdeploymentState.targetSubdeploymentFolder
   *
   * Example input: "C:\MyRepo\libraries\my-lib"
   * Example output: "C:\MyRepo\common\deploy\my-scenario\libraries\my-lib"
   */
  private _remapPathForDeployFolder(absolutePathInSourceFolder: string,
    subdemploymentState: ISubdeploymentState): string {

    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, this._sourceRootFolder)) {
      throw new Error("Source path is not under " + this._sourceRootFolder + "\n" + absolutePathInSourceFolder);
    }
    const relativePath: string = path.relative(this._sourceRootFolder, absolutePathInSourceFolder);
    const absolutePathInTargetFolder: string = path.join(subdemploymentState.targetSubdeploymentFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  /**
   * Maps a file path from DeployManager._sourceRootFolder --> relative path
   *
   * Example input: "C:\MyRepo\libraries\my-lib"
   * Example output: "libraries/my-lib"
   */
  private _remapPathForDeployMetadata(absolutePathInSourceFolder: string,
    subdemploymentState: ISubdeploymentState): string {

    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, this._sourceRootFolder)) {
      throw new Error(`Source path is not under ${this._sourceRootFolder}\n${absolutePathInSourceFolder}`);
    }
    const relativePath: string = path.relative(this._sourceRootFolder, absolutePathInSourceFolder);
    return Text.replaceAll(relativePath, '\\', '/');
  }


  /**
   * Copy one package folder to the deployment target folder.
   */
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

  /**
   * Create a symlink as described by the ILinkInfo object.
   */
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

  /**
   * Recursively apply the "additionalProjectToInclude" setting.
   */
  private _collectAdditionalProjectsToInclude(includedProjectNamesSet: Set<string>, projectName: string): void {
    if (includedProjectNamesSet.has(projectName)) {
      return;
    }
    includedProjectNamesSet.add(projectName);

    const projectSettings: IDeployScenarioProjectJson | undefined
      = this._deployScenarioProjectJsonsByName.get(projectName);
    if (projectSettings && projectSettings.additionalProjectsToInclude) {
      for (const additionalProjectToInclude of projectSettings.additionalProjectsToInclude) {
        this._collectAdditionalProjectsToInclude(includedProjectNamesSet, additionalProjectToInclude);
      }
    }
  }

  private _writeDeployMetadata(subdemploymentState: ISubdeploymentState): void {
    const deployMetadataFilePath: string = path.join(subdemploymentState.targetSubdeploymentFolder,
      'deploy-metadata.json');

    const deployMetadataJson: IDeployMetadataJson = {
      scenarioName: subdemploymentState.scenarioName,
      mainProjectName: subdemploymentState.mainProjectName,
      links: [ ]
    };

    // Remap the links to be relative to the subdeployment folder
    for (const absoluteLinkInfo of subdemploymentState.symlinkAnalyzer.reportSymlinks()) {
      const relativeInfo: ILinkInfo = {
        kind: absoluteLinkInfo.kind,
        linkPath: this._remapPathForDeployMetadata(absoluteLinkInfo.linkPath, subdemploymentState),
        targetPath: this._remapPathForDeployMetadata(absoluteLinkInfo.targetPath, subdemploymentState),
      };
      deployMetadataJson.links.push(relativeInfo);
    }

    JsonFile.save(deployMetadataJson, deployMetadataFilePath, {
      newlineConversion: NewlineKind.OsDefault
    });
  }

  /**
   * Process one subdeployment.  If `enableSubdeployments` is false, then this processes the entire
   * deployment, and ISubdeploymentState.targetSubdeploymentFolder is simply the deployment target folder.
   */
  private _deploySubdeployment(subdemploymentState: ISubdeploymentState): void {
    // Calculate the set with additionalProjectsToInclude
    const includedProjectNamesSet: Set<string> = new Set();
    this._collectAdditionalProjectsToInclude(includedProjectNamesSet, subdemploymentState.mainProjectName);

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

      this._collectFoldersRecursive(project.projectFolder, subdemploymentState);
    }

    Sort.sortSet(subdemploymentState.foldersToCopy);

    console.log("Copying folders...");
    for (const folderToCopy of subdemploymentState.foldersToCopy) {
      this._deployFolder(folderToCopy, subdemploymentState);
    }

    console.log('Writing deploy-metadata.json');
    this._writeDeployMetadata(subdemploymentState);

    if (this._deployScenarioJson.linkCreation === 'script') {
      console.log('Copying create-links.js');
      FileSystem.copyFile({
        sourcePath: path.join(__dirname, '../../scripts/create-links.js'),
        destinationPath: path.join(subdemploymentState.targetSubdeploymentFolder, 'create-links.js'),
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }

    if (this._deployScenarioJson.linkCreation === 'default') {
      console.log('Creating symlinks...');
      const linksToCopy: ILinkInfo[] = subdemploymentState.symlinkAnalyzer.reportSymlinks();

      for (const linkToCopy of linksToCopy) {
        if (!this._deploySymlink(linkToCopy, subdemploymentState)) {
          // TODO: If a symbolic link points to another symbolic link, then we should order the operations
          // so that the intermediary target is created first.  This case was procrastinated because it does
          // not seem to occur in practice.  If you encounter this, please report it.
          throw new InternalError('Target does not exist: ' + JSON.stringify(linkToCopy, undefined, 2));
        }
      }
    }
  }

  /**
   * The main entry point for performing a deployment.
   */
  public deployScenario(scenarioName: string, overwriteExisting: boolean,
    targetFolderParameter: string | undefined): void {

    DeployManager.validateScenarioName(scenarioName);

    if (this._targetRootFolder !== undefined) {
      // We can remove this restriction, but currently there is no reason.
      throw new InternalError('deployScenario() cannot be called twice');
    }

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

    console.log(colors.cyan("Deploying to target folder:  ") + this._targetRootFolder + '\n');

    FileSystem.ensureFolder(this._targetRootFolder);

    // Is the target folder empty?
    if (FileSystem.readFolder(this._targetRootFolder).length > 0) {
      if (overwriteExisting) {
        console.log('Deleting target folder contents because "--overwrite" was specified...');
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

        console.log(colors.green(`\nPreparing subdeployment for "${subdeploymentFolderName}"`));

        const subdemploymentState: ISubdeploymentState = {
          scenarioName: scenarioName,
          mainProjectName: subdeploymentProjectName,
          targetSubdeploymentFolder: path.join(this._targetRootFolder, subdeploymentFolderName),
          foldersToCopy: new Set(),
          folderInfosByPath: new Map(),
          symlinkAnalyzer: new SymlinkAnalyzer()
        };

        this._deploySubdeployment(subdemploymentState);
      }
    } else {
      if (deploymentProjectNames.length !== 1) {
        throw new Error(`The "deploymentProjectNames" setting specifies specifies more than one project;`
          + ' this is not supported unless the "enableSubdeployments" setting is true.');
      }

      const subdemploymentState: ISubdeploymentState = {
        scenarioName: scenarioName,
        mainProjectName: deploymentProjectNames[0],
        targetSubdeploymentFolder: this._targetRootFolder,
        foldersToCopy: new Set(),
        folderInfosByPath: new Map(),
        symlinkAnalyzer: new SymlinkAnalyzer()
      };

      this._deploySubdeployment(subdemploymentState);
    }

    console.log("\nThe operation completed successfully.");
  }
}
