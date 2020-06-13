// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import * as resolve from 'resolve';
import * as npmPacklist from 'npm-packlist';
import ignore, { Ignore } from 'ignore';
import {
  Path,
  FileSystem,
  PackageJsonLookup,
  FileSystemStats,
  Sort,
  JsonFile,
  IPackageJson,
  AlreadyExistsBehavior,
  InternalError,
  NewlineKind,
  Text
} from '@rushstack/node-core-library';
import { RushConfiguration } from '../../api/RushConfiguration';
import { SymlinkAnalyzer, ILinkInfo } from './SymlinkAnalyzer';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { DeployScenarioConfiguration, IDeployScenarioProjectJson } from './DeployScenarioConfiguration';

// (@types/npm-packlist is missing this API)
declare module 'npm-packlist' {
  export class WalkerSync {
    public readonly result: string[];
    public constructor(opts: { path: string });
    public start(): void;
  }
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
 * Only some of the IDeploymentState.foldersToCopy items will an IFolderInfo object.
 */
interface IFolderInfo {
  /**
   * This is the lookup key for IDeploymentState.folderInfosByPath.
   * It is an absolute real path.
   */
  folderPath: string;
  /**
   * True if this is the package folder for a local Rush project.
   */
  isRushProject: boolean;
}

/**
 * This object tracks DeployManager state during a deployment.
 */
interface IDeploymentState {
  scenarioFilePath: string;

  /**
   * The parsed scenario config file, as defined by the "deploy-scenario.schema.json" JSON schema
   */
  deployScenarioConfiguration: DeployScenarioConfiguration;

  mainProjectName: string;

  /**
   * The source folder that copying originates from.  Generally it is the repo root folder with rush.json.
   */
  sourceRootFolder: string;

  /**
   * The target folder for the deployment.  By default it will be "common/deploy".
   */
  targetRootFolder: string;

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
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _packageJsonLookup: PackageJsonLookup;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._packageJsonLookup = new PackageJsonLookup();
  }

  /**
   * Recursively crawl the node_modules dependencies and collect the result in IDeploymentState.foldersToCopy.
   */
  private _collectFoldersRecursive(packageJsonFolderPath: string, deploymentState: IDeploymentState): void {
    const packageJsonRealFolderPath: string = FileSystem.getRealPath(packageJsonFolderPath);

    if (!deploymentState.foldersToCopy.has(packageJsonRealFolderPath)) {
      deploymentState.foldersToCopy.add(packageJsonRealFolderPath);

      const packageJson: IPackageJson = JsonFile.load(path.join(packageJsonRealFolderPath, 'package.json'));

      // Union of keys from regular dependencies, peerDependencies, and optionalDependencies
      const allDependencyNames: Set<string> = new Set<string>();
      // Just the keys from optionalDependencies
      const optionalDependencyNames: Set<string> = new Set<string>();

      for (const name of Object.keys(packageJson.dependencies || {})) {
        allDependencyNames.add(name);
      }
      if (deploymentState.deployScenarioConfiguration.deployScenarioJson.includeDevDependencies) {
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

      // (Used only by the legacy code fragment in the resolve.sync() hook below)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs: typeof import('fs') = require('fs');

      for (const dependencyPackageName of allDependencyNames) {
        // The "resolve" library models the Node.js require() API, which gives precedence to "core" system modules
        // over an NPM package with the same name.  But we are traversing package.json dependencies, which refer
        // to system modules.  Appending a "/" forces require() to load the NPM package.
        const resolveSuffix: string =
          dependencyPackageName + resolve.isCore(dependencyPackageName) ? '/' : '';

        try {
          const resolvedDependency: string = resolve.sync(dependencyPackageName + resolveSuffix, {
            basedir: packageJsonRealFolderPath,
            preserveSymlinks: false,
            packageFilter: (pkg, dir) => {
              // point "main" at a file that is guaranteed to exist
              // This helps resolve packages such as @types/node that have no entry point
              pkg.main = './package.json';
              return pkg;
            },
            realpathSync: (filePath) => {
              // This code fragment is a modification of the documented default implementation from the "fs-extra" docs
              try {
                const resolvedPath: string = fs.realpathSync(filePath);

                deploymentState.symlinkAnalyzer.analyzePath(filePath);
                return resolvedPath;
              } catch (realpathErr) {
                if (realpathErr.code !== 'ENOENT') {
                  throw realpathErr;
                }
              }
              return filePath;
            }
          });

          if (!resolvedDependency) {
            if (optionalDependencyNames.has(dependencyPackageName)) {
              // Ignore missing optional dependency
              continue;
            }
            throw new Error(`Error resolving ${dependencyPackageName} from ${packageJsonRealFolderPath}`);
          }

          const dependencyPackageFolderPath:
            | string
            | undefined = this._packageJsonLookup.tryGetPackageFolderFor(resolvedDependency);
          if (!dependencyPackageFolderPath) {
            throw new Error(`Error finding package.json folder for ${resolvedDependency}`);
          }

          this._collectFoldersRecursive(dependencyPackageFolderPath, deploymentState);
        } catch (resolveErr) {
          if (resolveErr.code === 'MODULE_NOT_FOUND' && optionalDependencyNames.has(dependencyPackageName)) {
            // Ignore missing optional dependency
            continue;
          }
          throw resolveErr;
        }
      }
    }
  }

  /**
   * Maps a file path from DeployManager._sourceRootFolder --> IDeploymentState.targetRootFolder
   *
   * Example input: "C:\MyRepo\libraries\my-lib"
   * Example output: "C:\MyRepo\common\deploy\libraries\my-lib"
   */
  private _remapPathForDeployFolder(
    absolutePathInSourceFolder: string,
    deploymentState: IDeploymentState
  ): string {
    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, deploymentState.sourceRootFolder)) {
      throw new Error(
        `Source path is not under ${deploymentState.sourceRootFolder}\n${absolutePathInSourceFolder}`
      );
    }
    const relativePath: string = path.relative(deploymentState.sourceRootFolder, absolutePathInSourceFolder);
    const absolutePathInTargetFolder: string = path.join(deploymentState.targetRootFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  /**
   * Maps a file path from DeployManager._sourceRootFolder --> relative path
   *
   * Example input: "C:\MyRepo\libraries\my-lib"
   * Example output: "libraries/my-lib"
   */
  private _remapPathForDeployMetadata(
    absolutePathInSourceFolder: string,
    deploymentState: IDeploymentState
  ): string {
    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, deploymentState.sourceRootFolder)) {
      throw new Error(
        `Source path is not under ${deploymentState.sourceRootFolder}\n${absolutePathInSourceFolder}`
      );
    }
    const relativePath: string = path.relative(deploymentState.sourceRootFolder, absolutePathInSourceFolder);
    return Text.replaceAll(relativePath, '\\', '/');
  }

  /**
   * Copy one package folder to the deployment target folder.
   */
  private _deployFolder(sourceFolderPath: string, deploymentState: IDeploymentState): void {
    let useNpmIgnoreFilter: boolean = false;

    if (!deploymentState.deployScenarioConfiguration.deployScenarioJson.includeNpmIgnoreFiles) {
      const sourceFolderInfo: IFolderInfo | undefined = deploymentState.folderInfosByPath.get(
        FileSystem.getRealPath(sourceFolderPath)
      );
      if (sourceFolderInfo) {
        if (sourceFolderInfo.isRushProject) {
          useNpmIgnoreFilter = true;
        }
      }
    }

    const targetFolderPath: string = this._remapPathForDeployFolder(sourceFolderPath, deploymentState);

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

        if (deploymentState.symlinkAnalyzer.analyzePath(copySourcePath).kind !== 'link') {
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
            return true; // don't filter sourceFolderPath itself
          }

          if (ignoreFilter.ignores(relativeSrc)) {
            return false;
          }

          const stats: FileSystemStats = FileSystem.getLinkStatistics(src);
          if (stats.isSymbolicLink()) {
            deploymentState.symlinkAnalyzer.analyzePath(src);
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
  private _deploySymlink(originalLinkInfo: ILinkInfo, deploymentState: IDeploymentState): boolean {
    const linkInfo: ILinkInfo = {
      kind: originalLinkInfo.kind,
      linkPath: this._remapPathForDeployFolder(originalLinkInfo.linkPath, deploymentState),
      targetPath: this._remapPathForDeployFolder(originalLinkInfo.targetPath, deploymentState)
    };

    // Has the link target been created yet?  If not, we should try again later
    if (!FileSystem.exists(linkInfo.targetPath)) {
      return false;
    }

    const newLinkFolder: string = path.dirname(linkInfo.linkPath);
    FileSystem.ensureFolder(newLinkFolder);

    // Link to the relative path for symlinks
    const relativeTargetPath: string = path.relative(newLinkFolder, linkInfo.targetPath);

    // NOTE: This logic is based on NpmLinkManager._createSymlink()
    if (process.platform === 'win32') {
      if (linkInfo.kind === 'folderLink') {
        // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
        FileSystem.createSymbolicLinkJunction({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      } else {
        // For files, we use a Windows "hard link", because creating a symbolic link requires
        // administrator permission.

        // NOTE: We cannot use the relative path for hard links
        FileSystem.createHardLink({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      }
    } else {
      // However hard links seem to cause build failures on Mac, so for all other operating systems
      // we use symbolic links for this case.
      if (linkInfo.kind === 'folderLink') {
        FileSystem.createSymbolicLinkFolder({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      } else {
        FileSystem.createSymbolicLinkFile({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      }
    }

    return true;
  }

  /**
   * Recursively apply the "additionalProjectToInclude" setting.
   */
  private _collectAdditionalProjectsToInclude(
    includedProjectNamesSet: Set<string>,
    projectName: string,
    deploymentState: IDeploymentState
  ): void {
    if (includedProjectNamesSet.has(projectName)) {
      return;
    }
    includedProjectNamesSet.add(projectName);

    const projectSettings:
      | IDeployScenarioProjectJson
      | undefined = deploymentState.deployScenarioConfiguration.deployScenarioProjectJsonsByName.get(
      projectName
    );
    if (projectSettings && projectSettings.additionalProjectsToInclude) {
      for (const additionalProjectToInclude of projectSettings.additionalProjectsToInclude) {
        this._collectAdditionalProjectsToInclude(
          includedProjectNamesSet,
          additionalProjectToInclude,
          deploymentState
        );
      }
    }
  }

  private _writeDeployMetadata(deploymentState: IDeploymentState): void {
    const deployMetadataFilePath: string = path.join(
      deploymentState.targetRootFolder,
      'deploy-metadata.json'
    );

    const deployMetadataJson: IDeployMetadataJson = {
      scenarioName: path.basename(deploymentState.scenarioFilePath),
      mainProjectName: deploymentState.mainProjectName,
      links: []
    };

    // Remap the links to be relative to target folder
    for (const absoluteLinkInfo of deploymentState.symlinkAnalyzer.reportSymlinks()) {
      const relativeInfo: ILinkInfo = {
        kind: absoluteLinkInfo.kind,
        linkPath: this._remapPathForDeployMetadata(absoluteLinkInfo.linkPath, deploymentState),
        targetPath: this._remapPathForDeployMetadata(absoluteLinkInfo.targetPath, deploymentState)
      };
      deployMetadataJson.links.push(relativeInfo);
    }

    JsonFile.save(deployMetadataJson, deployMetadataFilePath, {
      newlineConversion: NewlineKind.OsDefault
    });
  }

  private _prepareDeployment(deploymentState: IDeploymentState): void {
    // Calculate the set with additionalProjectsToInclude
    const includedProjectNamesSet: Set<string> = new Set();
    this._collectAdditionalProjectsToInclude(
      includedProjectNamesSet,
      deploymentState.mainProjectName,
      deploymentState
    );

    for (const rushProject of this._rushConfiguration.projects) {
      const projectFolder: string = FileSystem.getRealPath(rushProject.projectFolder);
      deploymentState.folderInfosByPath.set(projectFolder, {
        folderPath: projectFolder,
        isRushProject: true
      });
    }

    for (const projectName of includedProjectNamesSet) {
      console.log(`Analyzing project "${projectName}"`);
      const project: RushConfigurationProject | undefined = this._rushConfiguration.getProjectByName(
        projectName
      );

      if (!project) {
        throw new Error(`The project ${projectName} is not defined in rush.json`);
      }

      this._collectFoldersRecursive(project.projectFolder, deploymentState);
    }

    Sort.sortSet(deploymentState.foldersToCopy);

    console.log('Copying folders...');
    for (const folderToCopy of deploymentState.foldersToCopy) {
      this._deployFolder(folderToCopy, deploymentState);
    }

    console.log('Writing deploy-metadata.json');
    this._writeDeployMetadata(deploymentState);

    if (deploymentState.deployScenarioConfiguration.deployScenarioJson.linkCreation === 'script') {
      console.log('Copying create-links.js');
      FileSystem.copyFile({
        sourcePath: path.join(__dirname, '../../scripts/create-links.js'),
        destinationPath: path.join(deploymentState.targetRootFolder, 'create-links.js'),
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }

    if (deploymentState.deployScenarioConfiguration.deployScenarioJson.linkCreation === 'default') {
      console.log('Creating symlinks...');
      const linksToCopy: ILinkInfo[] = deploymentState.symlinkAnalyzer.reportSymlinks();

      for (const linkToCopy of linksToCopy) {
        if (!this._deploySymlink(linkToCopy, deploymentState)) {
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
  public deploy(
    mainProjectName: string | undefined,
    scenarioName: string | undefined,
    overwriteExisting: boolean,
    targetFolderParameter: string | undefined
  ): void {
    const scenarioFilePath: string = DeployScenarioConfiguration.getConfigFilePath(
      scenarioName,
      this._rushConfiguration
    );
    const deployScenarioConfiguration: DeployScenarioConfiguration = DeployScenarioConfiguration.loadFromFile(
      scenarioFilePath,
      this._rushConfiguration
    );

    if (!mainProjectName) {
      if (deployScenarioConfiguration.deployScenarioJson.deploymentProjectNames.length === 1) {
        // If there is only one project, then "--project" is optional
        mainProjectName = deployScenarioConfiguration.deployScenarioJson.deploymentProjectNames[0];
      } else {
        throw new Error(
          `The ${path.basename(scenarioFilePath)} configuration specifies multiple items for` +
            ` "deploymentProjectNames". Use the "--project" parameter to indicate the project to be deployed.`
        );
      }
    } else {
      if (
        deployScenarioConfiguration.deployScenarioJson.deploymentProjectNames.indexOf(mainProjectName) < 0
      ) {
        throw new Error(
          `The project "${mainProjectName}" does not appear in the list of "deploymentProjectNames"` +
            ` from ${path.basename(scenarioFilePath)}.`
        );
      }
    }

    let targetRootFolder: string;
    if (targetFolderParameter) {
      targetRootFolder = path.resolve(targetFolderParameter);
      if (!FileSystem.exists(targetRootFolder)) {
        throw new Error(
          'The specified target folder does not exist: ' + JSON.stringify(targetFolderParameter)
        );
      }
    } else {
      targetRootFolder = path.join(this._rushConfiguration.commonFolder, 'deploy');
    }
    const sourceRootFolder: string = this._rushConfiguration.rushJsonFolder;

    console.log(colors.cyan('Deploying to target folder:  ') + targetRootFolder);
    console.log(colors.cyan('Main project for deployment: ') + mainProjectName + '\n');

    FileSystem.ensureFolder(targetRootFolder);

    // Is the target folder empty?
    if (FileSystem.readFolder(targetRootFolder).length > 0) {
      if (overwriteExisting) {
        console.log('Deleting target folder contents because "--overwrite" was specified...');
        FileSystem.ensureEmptyFolder(targetRootFolder);
      } else {
        throw new Error(
          'The deploy target folder is not empty. You can specify "--overwrite"' +
            ' to recursively delete all folder contents.'
        );
      }
    }

    const deploymentState: IDeploymentState = {
      scenarioFilePath,
      deployScenarioConfiguration,
      mainProjectName,
      sourceRootFolder,
      targetRootFolder,
      foldersToCopy: new Set(),
      folderInfosByPath: new Map(),
      symlinkAnalyzer: new SymlinkAnalyzer()
    };

    this._prepareDeployment(deploymentState);

    console.log('\n' + colors.green('The operation completed successfully.'));
  }
}
