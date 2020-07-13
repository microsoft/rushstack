// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import * as resolve from 'resolve';
import * as npmPacklist from 'npm-packlist';
import pnpmLinkBins from '@pnpm/link-bins';

// (Used only by the legacy code fragment in the resolve.sync() hook below)
import * as fsForResolve from 'fs';

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
import { DeployArchiver } from './DeployArchiver';
import { RushConfiguration } from '../../api/RushConfiguration';
import { SymlinkAnalyzer, ILinkInfo } from './SymlinkAnalyzer';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { DeployScenarioConfiguration, IDeployScenarioProjectJson } from './DeployScenarioConfiguration';
import { PnpmfileConfiguration } from './PnpmfileConfiguration';

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
  projects: IProjectInfoJson[];
  links: ILinkInfo[];
}

/**
 * Part of the deploy-matadata.json file format. Represents a Rush project to be deployed.
 */
interface IProjectInfoJson {
  /**
   * This path is relative to the deploy folder.
   */
  path: string;
}

/**
 * Stores additional information about folders being copied.
 * Only some of the IDeployState.foldersToCopy items will an IFolderInfo object.
 */
interface IFolderInfo {
  /**
   * This is the lookup key for IDeployState.folderInfosByPath.
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
export interface IDeployState {
  scenarioFilePath: string;

  /**
   * The parsed scenario config file, as defined by the "deploy-scenario.schema.json" JSON schema
   */
  scenarioConfiguration: DeployScenarioConfiguration;

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

  pnpmfileConfiguration: PnpmfileConfiguration;

  /**
   * The desired path to be used when archiving the target folder. Supported file extensions: .zip.
   */
  createArchiveFilePath: string | undefined;
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
   * Recursively crawl the node_modules dependencies and collect the result in IDeployState.foldersToCopy.
   */
  private _collectFoldersRecursive(packageJsonFolderPath: string, deployState: IDeployState): void {
    const packageJsonRealFolderPath: string = FileSystem.getRealPath(packageJsonFolderPath);

    if (!deployState.foldersToCopy.has(packageJsonRealFolderPath)) {
      deployState.foldersToCopy.add(packageJsonRealFolderPath);

      const originalPackageJson: IPackageJson = JsonFile.load(
        path.join(packageJsonRealFolderPath, 'package.json')
      );

      // Transform packageJson using pnpmfile.js
      const packageJson: IPackageJson = deployState.pnpmfileConfiguration.transform(originalPackageJson);

      // Union of keys from regular dependencies, peerDependencies, optionalDependencies
      // (and possibly devDependencies if includeDevDependencies=true)
      const allDependencyNames: Set<string> = new Set<string>();

      // Just the keys from optionalDependencies and peerDependencies
      const optionalDependencyNames: Set<string> = new Set<string>();

      for (const name of Object.keys(packageJson.dependencies || {})) {
        allDependencyNames.add(name);
      }
      if (deployState.scenarioConfiguration.json.includeDevDependencies) {
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
        try {
          this._traceResolveDependency(dependencyPackageName, packageJsonRealFolderPath, deployState);
        } catch (resolveErr) {
          if (resolveErr.code === 'MODULE_NOT_FOUND' && optionalDependencyNames.has(dependencyPackageName)) {
            // Ignore missing optional dependency
            continue;
          }
          throw resolveErr;
        }
      }

      if (
        this._rushConfiguration.packageManager === 'pnpm' &&
        !deployState.scenarioConfiguration.json.omitPnpmWorkaroundLinks
      ) {
        // Replicate the PNPM workaround links.

        // Only apply this logic for packages that were actually installed under the common/temp folder.
        if (Path.isUnder(packageJsonFolderPath, this._rushConfiguration.commonTempFolder)) {
          try {
            // The PNPM workaround links are created in this folder.  We will resolve the current package
            // from that location and collect any additional links encountered along the way.
            const pnpmDotFolderPath: string = path.join(
              this._rushConfiguration.commonTempFolder,
              'node_modules',
              '.pnpm'
            );

            // TODO: Investigate how package aliases are handled by PNPM in this case.  For example:
            //
            // "dependencies": {
            //   "alias-name": "npm:real-name@^1.2.3"
            // }
            this._traceResolveDependency(packageJson.name, pnpmDotFolderPath, deployState);
          } catch (resolveErr) {
            if (resolveErr.code === 'MODULE_NOT_FOUND') {
              // The workaround link isn't guaranteed to exist, so ignore if it's missing
              // NOTE: If you encounter this warning a lot, please report it to the Rush maintainers.
              console.log('Ignoring missing PNPM workaround link for ' + packageJsonFolderPath);
            }
          }
        }
      }
    }
  }

  private _traceResolveDependency(
    packageName: string,
    startingFolder: string,
    deployState: IDeployState
  ): void {
    // The "resolve" library models the Node.js require() API, which gives precedence to "core" system modules
    // over an NPM package with the same name.  But we are traversing package.json dependencies, which never
    // refer to system modules.  Appending a "/" forces require() to look for the NPM package.
    const resolveSuffix: string = packageName + resolve.isCore(packageName) ? '/' : '';

    const resolvedDependency: string = resolve.sync(packageName + resolveSuffix, {
      basedir: startingFolder,
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
          const resolvedPath: string = fsForResolve.realpathSync(filePath);

          deployState.symlinkAnalyzer.analyzePath(filePath);
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
      // This should not happen, since the resolve.sync() docs say it will throw an exception instead
      throw new InternalError(`Error resolving ${packageName} from ${startingFolder}`);
    }

    const dependencyPackageFolderPath: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(
      resolvedDependency
    );

    if (!dependencyPackageFolderPath) {
      throw new Error(`Error finding package.json folder for ${resolvedDependency}`);
    }

    this._collectFoldersRecursive(dependencyPackageFolderPath, deployState);
  }

  /**
   * Maps a file path from IDeployState.sourceRootFolder --> IDeployState.targetRootFolder
   *
   * Example input: "C:\MyRepo\libraries\my-lib"
   * Example output: "C:\MyRepo\common\deploy\libraries\my-lib"
   */
  private _remapPathForDeployFolder(absolutePathInSourceFolder: string, deployState: IDeployState): string {
    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, deployState.sourceRootFolder)) {
      throw new Error(
        `Source path is not under ${deployState.sourceRootFolder}\n${absolutePathInSourceFolder}`
      );
    }
    const relativePath: string = path.relative(deployState.sourceRootFolder, absolutePathInSourceFolder);
    const absolutePathInTargetFolder: string = path.join(deployState.targetRootFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  /**
   * Maps a file path from IDeployState.sourceRootFolder --> relative path
   *
   * Example input: "C:\MyRepo\libraries\my-lib"
   * Example output: "libraries/my-lib"
   */
  private _remapPathForDeployMetadata(absolutePathInSourceFolder: string, deployState: IDeployState): string {
    if (!Path.isUnderOrEqual(absolutePathInSourceFolder, deployState.sourceRootFolder)) {
      throw new Error(
        `Source path is not under ${deployState.sourceRootFolder}\n${absolutePathInSourceFolder}`
      );
    }
    const relativePath: string = path.relative(deployState.sourceRootFolder, absolutePathInSourceFolder);
    return Text.replaceAll(relativePath, '\\', '/');
  }

  /**
   * Copy one package folder to the deployment target folder.
   */
  private _deployFolder(sourceFolderPath: string, deployState: IDeployState): void {
    let useNpmIgnoreFilter: boolean = false;

    if (!deployState.scenarioConfiguration.json.includeNpmIgnoreFiles) {
      const sourceFolderInfo: IFolderInfo | undefined = deployState.folderInfosByPath.get(
        FileSystem.getRealPath(sourceFolderPath)
      );
      if (sourceFolderInfo) {
        if (sourceFolderInfo.isRushProject) {
          useNpmIgnoreFilter = true;
        }
      }
    }

    const targetFolderPath: string = this._remapPathForDeployFolder(sourceFolderPath, deployState);

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

        if (deployState.symlinkAnalyzer.analyzePath(copySourcePath).kind !== 'link') {
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
            deployState.symlinkAnalyzer.analyzePath(src);
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
  private _deploySymlink(originalLinkInfo: ILinkInfo, deployState: IDeployState): boolean {
    const linkInfo: ILinkInfo = {
      kind: originalLinkInfo.kind,
      linkPath: this._remapPathForDeployFolder(originalLinkInfo.linkPath, deployState),
      targetPath: this._remapPathForDeployFolder(originalLinkInfo.targetPath, deployState)
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
    deployState: IDeployState
  ): void {
    if (includedProjectNamesSet.has(projectName)) {
      return;
    }
    includedProjectNamesSet.add(projectName);

    const projectSettings:
      | IDeployScenarioProjectJson
      | undefined = deployState.scenarioConfiguration.projectJsonsByName.get(projectName);
    if (projectSettings && projectSettings.additionalProjectsToInclude) {
      for (const additionalProjectToInclude of projectSettings.additionalProjectsToInclude) {
        this._collectAdditionalProjectsToInclude(
          includedProjectNamesSet,
          additionalProjectToInclude,
          deployState
        );
      }
    }
  }

  /**
   * Write the common/deploy/deploy-metadata.json file.
   */
  private _writeDeployMetadata(deployState: IDeployState): void {
    const deployMetadataFilePath: string = path.join(deployState.targetRootFolder, 'deploy-metadata.json');

    const deployMetadataJson: IDeployMetadataJson = {
      scenarioName: path.basename(deployState.scenarioFilePath),
      mainProjectName: deployState.mainProjectName,
      projects: [],
      links: []
    };

    deployState.folderInfosByPath.forEach((folderInfo) => {
      if (!folderInfo.isRushProject) {
        // It's not a Rush project
        return;
      }

      if (!deployState.foldersToCopy.has(folderInfo.folderPath)) {
        // It's not something we crawled
        return;
      }

      deployMetadataJson.projects.push({
        path: this._remapPathForDeployMetadata(folderInfo.folderPath, deployState)
      });
    });

    // Remap the links to be relative to target folder
    for (const absoluteLinkInfo of deployState.symlinkAnalyzer.reportSymlinks()) {
      const relativeInfo: ILinkInfo = {
        kind: absoluteLinkInfo.kind,
        linkPath: this._remapPathForDeployMetadata(absoluteLinkInfo.linkPath, deployState),
        targetPath: this._remapPathForDeployMetadata(absoluteLinkInfo.targetPath, deployState)
      };
      deployMetadataJson.links.push(relativeInfo);
    }

    JsonFile.save(deployMetadataJson, deployMetadataFilePath, {
      newlineConversion: NewlineKind.OsDefault
    });
  }

  private async _makeBinLinksAsync(deployState: IDeployState): Promise<void> {
    for (const [, folderInfo] of deployState.folderInfosByPath) {
      if (!folderInfo.isRushProject) {
        return;
      }

      const deployedPath: string = this._remapPathForDeployMetadata(folderInfo.folderPath, deployState);
      const projectFolder: string = path.join(deployState.targetRootFolder, deployedPath, 'node_modules');
      const projectBinFolder: string = path.join(
        deployState.targetRootFolder,
        deployedPath,
        'node_modules',
        '.bin'
      );

      await pnpmLinkBins(projectFolder, projectBinFolder, {
        warn: (msg: string) => console.warn(colors.yellow(msg))
      });
    }
  }

  private async _prepareDeploymentAsync(deployState: IDeployState): Promise<void> {
    // Calculate the set with additionalProjectsToInclude
    const includedProjectNamesSet: Set<string> = new Set();
    this._collectAdditionalProjectsToInclude(
      includedProjectNamesSet,
      deployState.mainProjectName,
      deployState
    );

    for (const rushProject of this._rushConfiguration.projects) {
      const projectFolder: string = FileSystem.getRealPath(rushProject.projectFolder);
      deployState.folderInfosByPath.set(projectFolder, {
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

      this._collectFoldersRecursive(project.projectFolder, deployState);
    }

    Sort.sortSet(deployState.foldersToCopy);

    console.log('Copying folders...');
    for (const folderToCopy of deployState.foldersToCopy) {
      this._deployFolder(folderToCopy, deployState);
    }

    console.log('Writing deploy-metadata.json');
    this._writeDeployMetadata(deployState);

    if (deployState.scenarioConfiguration.json.linkCreation === 'script') {
      console.log('Copying create-links.js');
      FileSystem.copyFile({
        sourcePath: path.join(__dirname, '../../scripts/create-links.js'),
        destinationPath: path.join(deployState.targetRootFolder, 'create-links.js'),
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }

    if (deployState.scenarioConfiguration.json.linkCreation === 'default') {
      console.log('Creating symlinks...');
      const linksToCopy: ILinkInfo[] = deployState.symlinkAnalyzer.reportSymlinks();

      for (const linkToCopy of linksToCopy) {
        if (!this._deploySymlink(linkToCopy, deployState)) {
          // TODO: If a symbolic link points to another symbolic link, then we should order the operations
          // so that the intermediary target is created first.  This case was procrastinated because it does
          // not seem to occur in practice.  If you encounter this, please report it.
          throw new InternalError('Target does not exist: ' + JSON.stringify(linkToCopy, undefined, 2));
        }
      }

      await this._makeBinLinksAsync(deployState);
    }
    if (deployState.scenarioConfiguration.json.folderNameToCopy !== undefined) {
      const sourceFolderPath: string = path.resolve(
        this._rushConfiguration.rushJsonFolder,
        deployState.scenarioConfiguration.json.folderNameToCopy
      );
      FileSystem.copyFiles({
        sourcePath: sourceFolderPath,
        destinationPath: deployState.targetRootFolder,
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }
    await DeployArchiver.createArchiveAsync(deployState);
  }

  /**
   * The main entry point for performing a deployment.
   */
  public async deployAsync(
    mainProjectName: string | undefined,
    scenarioName: string | undefined,
    overwriteExisting: boolean,
    targetFolderParameter: string | undefined,
    createArchiveFilePath: string | undefined
  ): Promise<void> {
    const scenarioFilePath: string = DeployScenarioConfiguration.getConfigFilePath(
      scenarioName,
      this._rushConfiguration
    );
    const scenarioConfiguration: DeployScenarioConfiguration = DeployScenarioConfiguration.loadFromFile(
      scenarioFilePath,
      this._rushConfiguration
    );

    if (!mainProjectName) {
      if (scenarioConfiguration.json.deploymentProjectNames.length === 1) {
        // If there is only one project, then "--project" is optional
        mainProjectName = scenarioConfiguration.json.deploymentProjectNames[0];
      } else {
        throw new Error(
          `The ${path.basename(scenarioFilePath)} configuration specifies multiple items for` +
            ` "deploymentProjectNames". Use the "--project" parameter to indicate the project to be deployed.`
        );
      }
    } else {
      if (scenarioConfiguration.json.deploymentProjectNames.indexOf(mainProjectName) < 0) {
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

    // If create archive is set, ensure it has a legal extension
    if (createArchiveFilePath && path.extname(createArchiveFilePath) !== '.zip') {
      throw new Error('Create-archive currently only supports creation of zip files.');
    }

    const deployState: IDeployState = {
      scenarioFilePath,
      scenarioConfiguration,
      mainProjectName,
      sourceRootFolder,
      targetRootFolder,
      foldersToCopy: new Set(),
      folderInfosByPath: new Map(),
      symlinkAnalyzer: new SymlinkAnalyzer(),
      pnpmfileConfiguration: new PnpmfileConfiguration(this._rushConfiguration),
      createArchiveFilePath
    };

    console.log();

    await this._prepareDeploymentAsync(deployState);

    console.log('\n' + colors.green('The operation completed successfully.'));
  }
}
