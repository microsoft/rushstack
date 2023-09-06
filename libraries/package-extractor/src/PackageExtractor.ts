// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import { IMinimatch, Minimatch } from 'minimatch';
import semver from 'semver';
import npmPacklist from 'npm-packlist';
import pnpmLinkBins from '@pnpm/link-bins';
import ignore, { Ignore } from 'ignore';
import {
  Async,
  AsyncQueue,
  Path,
  FileSystem,
  Import,
  Colors,
  JsonFile,
  AlreadyExistsBehavior,
  type IPackageJson,
  type ITerminal
} from '@rushstack/node-core-library';

import { ArchiveManager } from './ArchiveManager';
import { SymlinkAnalyzer, type ILinkInfo, type PathNode } from './SymlinkAnalyzer';
import { matchesWithStar } from './Utils';
import { createLinksScriptFilename, scriptsFolderPath } from './PathConstants';

// (@types/npm-packlist is missing this API)
declare module 'npm-packlist' {
  export class Walker {
    public readonly result: string[];
    public constructor(opts: { path: string });
    public on(event: 'done', callback: (result: string[]) => void): Walker;
    public on(event: 'error', callback: (error: Error) => void): Walker;
    public start(): void;
  }
}

/**
 * Part of the extractor-matadata.json file format. Represents an extracted project.
 *
 * @public
 */
export interface IProjectInfoJson {
  /**
   * The name of the project as specified in its package.json file.
   */
  projectName: string;
  /**
   * This path is relative to the root of the extractor output folder
   */
  path: string;
}

/**
 * The extractor-metadata.json file format.
 *
 * @public
 */
export interface IExtractorMetadataJson {
  /**
   * The name of the main project the extraction was performed for.
   */
  mainProjectName: string;
  /**
   * A list of all projects that were extracted.
   */
  projects: IProjectInfoJson[];
  /**
   * A list of all links that are part of the extracted project.
   */
  links: ILinkInfo[];
}

interface IExtractorState {
  foldersToCopy: Set<string>;
  packageJsonByPath: Map<string, IPackageJson>;
  projectConfigurationsByPath: Map<string, IExtractorProjectConfiguration>;
  projectConfigurationsByName: Map<string, IExtractorProjectConfiguration>;
  dependencyConfigurationsByName: Map<string, IExtractorDependencyConfiguration[]>;
  symlinkAnalyzer: SymlinkAnalyzer;
  archiver?: ArchiveManager;
}

/**
 * The extractor configuration for individual projects.
 *
 * @public
 */
export interface IExtractorProjectConfiguration {
  /**
   * The name of the project.
   */
  projectName: string;
  /**
   * The absolute path to the project.
   */
  projectFolder: string;
  /**
   * A list of glob patterns to include when extracting this project. If a path is
   * matched by both "patternsToInclude" and "patternsToExclude", the path will be
   * excluded. If undefined, all paths will be included.
   */
  patternsToInclude?: string[];
  /**
   * A list of glob patterns to exclude when extracting this project. If a path is
   * matched by both "patternsToInclude" and "patternsToExclude", the path will be
   * excluded. If undefined, no paths will be excluded.
   */
  patternsToExclude?: string[];
  /**
   * The names of additional projects to include when extracting this project.
   */
  additionalProjectsToInclude?: string[];
  /**
   * The names of additional dependencies to include when extracting this project.
   */
  additionalDependenciesToInclude?: string[];
  /**
   * The names of additional dependencies to exclude when extracting this project.
   */
  dependenciesToExclude?: string[];
}

/**
 * The extractor configuration for individual dependencies.
 *
 * @public
 */
export interface IExtractorDependencyConfiguration {
  /**
   * The name of dependency
   */
  dependencyName: string;
  /**
   * The semver version range of dependency
   */
  dependencyVersionRange: string;
  /**
   * A list of glob patterns to exclude when extracting this dependency. If a path is
   * matched by both "patternsToInclude" and "patternsToExclude", the path will be
   * excluded. If undefined, no paths will be excluded.
   */
  patternsToExclude?: string[];
  /**
   * A list of glob patterns to include when extracting this dependency. If a path is
   * matched by both "patternsToInclude" and "patternsToExclude", the path will be
   * excluded. If undefined, all paths will be included.
   */
  patternsToInclude?: string[];
}

/**
 * Options that can be provided to the extractor.
 *
 * @public
 */
export interface IExtractorOptions {
  /**
   * A terminal to log extraction progress.
   */
  terminal: ITerminal;

  /**
   * The main project to include in the extraction operation.
   */
  mainProjectName: string;

  /**
   * The source folder that copying originates from.  Generally it is the repo root folder.
   */
  sourceRootFolder: string;

  /**
   * The target folder for the extraction.
   */
  targetRootFolder: string;

  /**
   * Whether to overwrite the target folder if it already exists.
   */
  overwriteExisting: boolean;

  /**
   * The desired path to be used when archiving the target folder. Supported file extensions: .zip.
   */
  createArchiveFilePath?: string;

  /**
   * Whether to skip copying files to the extraction target directory, and only create an extraction
   * archive. This is only supported when linkCreation is 'script' or 'none'.
   */
  createArchiveOnly?: boolean;

  /**
   * The pnpmfile configuration if using PNPM, otherwise undefined. The configuration will be used to
   * transform the package.json prior to extraction.
   */
  transformPackageJson?: (packageJson: IPackageJson) => IPackageJson | undefined;

  /**
   * If dependencies from the "devDependencies" package.json field should be included in the extraction.
   */
  includeDevDependencies?: boolean;

  /**
   * If files ignored by the .npmignore file should be included in the extraction.
   */
  includeNpmIgnoreFiles?: boolean;

  /**
   * The folder where the PNPM "node_modules" folder is located. This is used to resolve packages linked
   * to the PNPM virtual store.
   */
  pnpmInstallFolder?: string;

  /**
   * The link creation mode to use.
   * "default": Create the links while copying the files; this is the default behavior. Use this setting
   * if your file copy tool can handle links correctly.
   * "script": A Node.js script called create-links.js will be written to the target folder. Use this setting
   * to create links on the server machine, after the files have been uploaded.
   * "none": Do nothing; some other tool may create the links later, based on the extractor-metadata.json file.
   */
  linkCreation?: 'default' | 'script' | 'none';

  /**
   * An additional folder containing files which will be copied into the root of the extraction.
   */
  folderToCopy?: string;

  /**
   * Configurations for individual projects, keyed by the project path relative to the sourceRootFolder.
   */
  projectConfigurations: IExtractorProjectConfiguration[];

  /**
   * Configurations for individual dependencies.
   */
  dependencyConfigurations?: IExtractorDependencyConfiguration[];
}

/**
 * Manages the business logic for the "rush deploy" command.
 *
 * @public
 */
export class PackageExtractor {
  /**
   * Get a list of files that would be included in a package created from the provided package root path.
   *
   * @beta
   */
  public static async getPackageIncludedFilesAsync(packageRootPath: string): Promise<string[]> {
    // Use npm-packlist to filter the files.  Using the Walker class (instead of the default API) ensures
    // that "bundledDependencies" are not included.
    const walkerPromise: Promise<string[]> = new Promise<string[]>(
      (resolve: (result: string[]) => void, reject: (error: Error) => void) => {
        const walker: npmPacklist.Walker = new npmPacklist.Walker({
          path: packageRootPath
        });
        walker.on('done', resolve).on('error', reject).start();
      }
    );
    const npmPackFiles: string[] = await walkerPromise;
    return npmPackFiles;
  }

  /**
   * Extract a package using the provided options
   */
  public async extractAsync(options: IExtractorOptions): Promise<void> {
    const {
      terminal,
      projectConfigurations,
      sourceRootFolder,
      targetRootFolder,
      mainProjectName,
      overwriteExisting,
      createArchiveFilePath,
      createArchiveOnly,
      dependencyConfigurations
    } = options;

    if (createArchiveOnly) {
      if (options.linkCreation !== 'script' && options.linkCreation !== 'none') {
        throw new Error('createArchiveOnly is only supported when linkCreation is "script" or "none"');
      }
      if (!createArchiveFilePath) {
        throw new Error('createArchiveOnly is only supported when createArchiveFilePath is specified');
      }
    }

    let archiver: ArchiveManager | undefined;
    let archiveFilePath: string | undefined;
    if (createArchiveFilePath) {
      if (path.extname(createArchiveFilePath) !== '.zip') {
        throw new Error('Only archives with the .zip file extension are currently supported.');
      }

      archiveFilePath = path.resolve(targetRootFolder, createArchiveFilePath);
      archiver = new ArchiveManager();
    }

    await FileSystem.ensureFolderAsync(targetRootFolder);

    terminal.writeLine(Colors.cyan(`Extracting to target folder:  ${targetRootFolder}`));
    terminal.writeLine(Colors.cyan(`Main project for extraction: ${mainProjectName}`));

    try {
      const existingExtraction: boolean =
        (await FileSystem.readFolderItemNamesAsync(targetRootFolder)).length > 0;
      if (existingExtraction) {
        if (!overwriteExisting) {
          throw new Error(
            'The extraction target folder is not empty. Overwrite must be explicitly requested'
          );
        } else {
          terminal.writeLine('Deleting target folder contents...');
          terminal.writeLine('');
          await FileSystem.ensureEmptyFolderAsync(targetRootFolder);
        }
      }
    } catch (error: unknown) {
      if (!FileSystem.isFolderDoesNotExistError(error as Error)) {
        throw error;
      }
    }

    // Create a new state for each run
    const state: IExtractorState = {
      foldersToCopy: new Set(),
      packageJsonByPath: new Map(),
      projectConfigurationsByName: new Map(projectConfigurations.map((p) => [p.projectName, p])),
      projectConfigurationsByPath: new Map(projectConfigurations.map((p) => [p.projectFolder, p])),
      dependencyConfigurationsByName: new Map(),
      symlinkAnalyzer: new SymlinkAnalyzer({ requiredSourceParentPath: sourceRootFolder }),
      archiver
    };
    // set state dependencyConfigurationsByName
    for (const dependencyConfiguration of dependencyConfigurations || []) {
      const { dependencyName } = dependencyConfiguration;
      let existingDependencyConfigurations: IExtractorDependencyConfiguration[] | undefined =
        state.dependencyConfigurationsByName.get(dependencyName);
      if (!existingDependencyConfigurations) {
        existingDependencyConfigurations = [];
        state.dependencyConfigurationsByName.set(dependencyName, existingDependencyConfigurations);
      }
      existingDependencyConfigurations.push(dependencyConfiguration);
    }

    await this._performExtractionAsync(options, state);
    if (archiver && archiveFilePath) {
      terminal.writeLine(`Creating archive at "${archiveFilePath}"`);
      await archiver.createArchiveAsync(archiveFilePath);
    }
  }

  private async _performExtractionAsync(options: IExtractorOptions, state: IExtractorState): Promise<void> {
    const {
      terminal,
      mainProjectName,
      sourceRootFolder,
      targetRootFolder,
      folderToCopy: addditionalFolderToCopy,
      linkCreation
    } = options;
    const { projectConfigurationsByName, foldersToCopy, symlinkAnalyzer } = state;

    const mainProjectConfiguration: IExtractorProjectConfiguration | undefined =
      projectConfigurationsByName.get(mainProjectName);
    if (!mainProjectConfiguration) {
      throw new Error(`Main project "${mainProjectName}" was not found in the list of projects`);
    }

    // Calculate the set with additionalProjectsToInclude
    const includedProjectsSet: Set<IExtractorProjectConfiguration> = new Set([mainProjectConfiguration]);
    for (const { additionalProjectsToInclude } of includedProjectsSet) {
      if (additionalProjectsToInclude) {
        for (const additionalProjectNameToInclude of additionalProjectsToInclude) {
          const additionalProjectToInclude: IExtractorProjectConfiguration | undefined =
            projectConfigurationsByName.get(additionalProjectNameToInclude);
          if (!additionalProjectToInclude) {
            throw new Error(
              `Project "${additionalProjectNameToInclude}" was not found in the list of projects.`
            );
          }
          includedProjectsSet.add(additionalProjectToInclude);
        }
      }
    }

    for (const { projectName, projectFolder } of includedProjectsSet) {
      terminal.writeLine(Colors.cyan(`Analyzing project: ${projectName}`));
      await this._collectFoldersAsync(projectFolder, options, state);
    }

    if (!options.createArchiveOnly) {
      terminal.writeLine(`Copying folders to target folder "${targetRootFolder}"`);
    }
    await Async.forEachAsync(
      foldersToCopy,
      async (folderToCopy: string) => {
        await this._extractFolderAsync(folderToCopy, options, state);
      },
      {
        concurrency: 10
      }
    );

    switch (linkCreation) {
      case 'script': {
        const sourceFilePath: string = path.join(scriptsFolderPath, createLinksScriptFilename);
        if (!options.createArchiveOnly) {
          terminal.writeLine(`Creating ${createLinksScriptFilename}`);
          await FileSystem.copyFileAsync({
            sourcePath: sourceFilePath,
            destinationPath: path.join(targetRootFolder, createLinksScriptFilename),
            alreadyExistsBehavior: AlreadyExistsBehavior.Error
          });
        }
        await state.archiver?.addToArchiveAsync({
          filePath: sourceFilePath,
          archivePath: createLinksScriptFilename
        });
        break;
      }
      case 'default': {
        terminal.writeLine('Creating symlinks');
        const linksToCopy: ILinkInfo[] = symlinkAnalyzer.reportSymlinks();
        await Async.forEachAsync(linksToCopy, async (linkToCopy: ILinkInfo) => {
          await this._extractSymlinkAsync(linkToCopy, options, state);
        });
        await this._makeBinLinksAsync(options, state);
        break;
      }
      default: {
        break;
      }
    }

    terminal.writeLine('Creating extractor-metadata.json');
    await this._writeExtractorMetadataAsync(options, state);

    if (addditionalFolderToCopy) {
      const sourceFolderPath: string = path.resolve(sourceRootFolder, addditionalFolderToCopy);
      await FileSystem.copyFilesAsync({
        sourcePath: sourceFolderPath,
        destinationPath: targetRootFolder,
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }
  }

  /**
   * Recursively crawl the node_modules dependencies and collect the result in IExtractorState.foldersToCopy.
   */
  private async _collectFoldersAsync(
    packageJsonFolder: string,
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const { terminal, pnpmInstallFolder, transformPackageJson } = options;
    const { projectConfigurationsByPath } = state;

    const packageJsonFolderPathQueue: AsyncQueue<string> = new AsyncQueue([packageJsonFolder]);

    await Async.forEachAsync(
      packageJsonFolderPathQueue,
      async ([packageJsonFolderPath, callback]: [string, () => void]) => {
        const packageJsonRealFolderPath: string = await FileSystem.getRealPathAsync(packageJsonFolderPath);
        if (state.foldersToCopy.has(packageJsonRealFolderPath)) {
          // we've already seen this folder
          callback();
          return;
        }
        state.foldersToCopy.add(packageJsonRealFolderPath);

        const originalPackageJson: IPackageJson = await JsonFile.loadAsync(
          path.join(packageJsonRealFolderPath, 'package.json')
        );

        // Transform packageJson using the provided transformer, if requested
        const packageJson: IPackageJson = transformPackageJson?.(originalPackageJson) ?? originalPackageJson;

        state.packageJsonByPath.set(packageJsonRealFolderPath, packageJson);
        // Union of keys from regular dependencies, peerDependencies, optionalDependencies
        // (and possibly devDependencies if includeDevDependencies=true)
        const dependencyNamesToProcess: Set<string> = new Set<string>();

        // Just the keys from optionalDependencies and peerDependencies
        const optionalDependencyNames: Set<string> = new Set<string>();

        for (const name of Object.keys(packageJson.dependencies || {})) {
          dependencyNamesToProcess.add(name);
        }
        for (const name of Object.keys(packageJson.peerDependencies || {})) {
          dependencyNamesToProcess.add(name);
          optionalDependencyNames.add(name); // consider peers optional, since they are so frequently broken
        }
        for (const name of Object.keys(packageJson.optionalDependencies || {})) {
          dependencyNamesToProcess.add(name);
          optionalDependencyNames.add(name);
        }

        // Check to see if this is a local project
        const projectConfiguration: IExtractorProjectConfiguration | undefined =
          projectConfigurationsByPath.get(packageJsonRealFolderPath);

        if (projectConfiguration) {
          if (options.includeDevDependencies) {
            for (const name of Object.keys(packageJson.devDependencies || {})) {
              dependencyNamesToProcess.add(name);
            }
          }

          this._applyDependencyFilters(
            terminal,
            dependencyNamesToProcess,
            projectConfiguration.additionalDependenciesToInclude,
            projectConfiguration.dependenciesToExclude
          );
        }

        for (const dependencyPackageName of dependencyNamesToProcess) {
          try {
            const dependencyPackageFolderPath: string = await Import.resolvePackageAsync({
              packageName: dependencyPackageName,
              baseFolderPath: packageJsonRealFolderPath,
              getRealPathAsync: async (filePath: string) => {
                try {
                  return (await state.symlinkAnalyzer.analyzePathAsync(filePath)).nodePath;
                } catch (error: unknown) {
                  if (FileSystem.isFileDoesNotExistError(error as Error)) {
                    return filePath;
                  }
                  throw error;
                }
              }
            });
            packageJsonFolderPathQueue.push(dependencyPackageFolderPath);
          } catch (resolveErr) {
            if (optionalDependencyNames.has(dependencyPackageName)) {
              // Ignore missing optional dependency
              continue;
            }
            throw resolveErr;
          }
        }

        // Replicate the links to the virtual store. Note that if the package has not been hoisted by
        // PNPM, the package will not be resolvable from here.
        // Only apply this logic for packages that were actually installed under the common/temp folder.
        if (pnpmInstallFolder && Path.isUnder(packageJsonFolderPath, pnpmInstallFolder)) {
          try {
            // The PNPM virtual store links are created in this folder.  We will resolve the current package
            // from that location and collect any additional links encountered along the way.
            // TODO: This can be configured via NPMRC. We should support that.
            const pnpmDotFolderPath: string = path.join(pnpmInstallFolder, 'node_modules', '.pnpm');

            // TODO: Investigate how package aliases are handled by PNPM in this case.  For example:
            //
            // "dependencies": {
            //   "alias-name": "npm:real-name@^1.2.3"
            // }
            const dependencyPackageFolderPath: string = await Import.resolvePackageAsync({
              packageName: packageJson.name,
              baseFolderPath: pnpmDotFolderPath,
              getRealPathAsync: async (filePath: string) => {
                try {
                  return (await state.symlinkAnalyzer.analyzePathAsync(filePath)).nodePath;
                } catch (error: unknown) {
                  if (FileSystem.isFileDoesNotExistError(error as Error)) {
                    return filePath;
                  }
                  throw error;
                }
              }
            });
            packageJsonFolderPathQueue.push(dependencyPackageFolderPath);
          } catch (resolveErr) {
            // The virtual store link isn't guaranteed to exist, so ignore if it's missing
            // NOTE: If you encounter this warning a lot, please report it to the Rush maintainers.
            console.log('Ignoring missing PNPM virtual store link for ' + packageJsonFolderPath);
          }
        }

        callback();
      },
      {
        concurrency: 10
      }
    );
  }

  private _applyDependencyFilters(
    terminal: ITerminal,
    allDependencyNames: Set<string>,
    additionalDependenciesToInclude: string[] = [],
    dependenciesToExclude: string[] = []
  ): Set<string> {
    // Track packages that got added/removed for reporting purposes
    const extraIncludedPackageNames: string[] = [];
    const extraExcludedPackageNames: string[] = [];

    for (const patternWithStar of dependenciesToExclude) {
      for (const dependency of allDependencyNames) {
        if (matchesWithStar(patternWithStar, dependency)) {
          if (allDependencyNames.delete(dependency)) {
            extraExcludedPackageNames.push(dependency);
          }
        }
      }
    }

    for (const dependencyToInclude of additionalDependenciesToInclude) {
      if (!allDependencyNames.has(dependencyToInclude)) {
        allDependencyNames.add(dependencyToInclude);
        extraIncludedPackageNames.push(dependencyToInclude);
      }
    }

    if (extraIncludedPackageNames.length > 0) {
      extraIncludedPackageNames.sort();
      terminal.writeLine(`Extra dependencies included by settings: ${extraIncludedPackageNames.join(', ')}`);
    }

    if (extraExcludedPackageNames.length > 0) {
      extraExcludedPackageNames.sort();
      terminal.writeLine(`Extra dependencies excluded by settings: ${extraExcludedPackageNames.join(', ')}`);
    }

    return allDependencyNames;
  }

  /**
   * Maps a file path from IExtractorOptions.sourceRootFolder to IExtractorOptions.targetRootFolder
   *
   * Example input: "C:\\MyRepo\\libraries\\my-lib"
   * Example output: "C:\\MyRepo\\common\\deploy\\libraries\\my-lib"
   */
  private _remapPathForExtractorFolder(
    absolutePathInSourceFolder: string,
    options: IExtractorOptions
  ): string {
    const { sourceRootFolder, targetRootFolder } = options;
    const relativePath: string = path.relative(sourceRootFolder, absolutePathInSourceFolder);
    if (relativePath.startsWith('..')) {
      throw new Error(`Source path "${absolutePathInSourceFolder}" is not under "${sourceRootFolder}"`);
    }
    const absolutePathInTargetFolder: string = path.join(targetRootFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  /**
   * Maps a file path from IExtractorOptions.sourceRootFolder to relative path
   *
   * Example input: "C:\\MyRepo\\libraries\\my-lib"
   * Example output: "libraries/my-lib"
   */
  private _remapPathForExtractorMetadata(
    absolutePathInSourceFolder: string,
    options: IExtractorOptions
  ): string {
    const { sourceRootFolder } = options;
    const relativePath: string = path.relative(sourceRootFolder, absolutePathInSourceFolder);
    if (relativePath.startsWith('..')) {
      throw new Error(`Source path "${absolutePathInSourceFolder}" is not under "${sourceRootFolder}"`);
    }
    return Path.convertToSlashes(relativePath);
  }

  /**
   * Copy one package folder to the extractor target folder.
   */
  private async _extractFolderAsync(
    sourceFolderPath: string,
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const { includeNpmIgnoreFiles, targetRootFolder } = options;
    const { projectConfigurationsByPath, packageJsonByPath, dependencyConfigurationsByName, archiver } =
      state;
    let useNpmIgnoreFilter: boolean = false;

    const sourceFolderRealPath: string = await FileSystem.getRealPathAsync(sourceFolderPath);
    const sourceProjectConfiguration: IExtractorProjectConfiguration | undefined =
      projectConfigurationsByPath.get(sourceFolderRealPath);

    const packagesJson: IPackageJson | undefined = packageJsonByPath.get(sourceFolderRealPath);
    // As this function will be used to copy folder for both project inside monorepo and third party dependencies insides node_modules
    // Third party dependencies won't have project configurations
    const isLocalProject: boolean = !!sourceProjectConfiguration;

    // Function to filter files inside local project or third party dependencies.
    const isFileExcluded = (filePath: string): boolean => {
      // Encapsulate exclude logic into a function, so it can be reused.
      const excludeFileByPatterns = (
        filePath: string,
        patternsToInclude: string[] | undefined,
        patternsToExclude: string[] | undefined
      ): boolean => {
        let includeFilters: IMinimatch[] | undefined;
        let excludeFilters: IMinimatch[] | undefined;
        if (patternsToInclude?.length) {
          includeFilters = patternsToInclude?.map((p) => new Minimatch(p, { dot: true }));
        }
        if (patternsToExclude?.length) {
          excludeFilters = patternsToExclude?.map((p) => new Minimatch(p, { dot: true }));
        }
        // If there are no filters, then we can't exclude anything.
        if (!includeFilters && !excludeFilters) {
          return false;
        }

        const isIncluded: boolean = !includeFilters || includeFilters.some((m) => m.match(filePath));

        // If the file is not included, then we don't need to check the excludeFilter. If it is included
        // and there is no exclude filter, then we know that the file is not excluded. If it is included
        // and there is an exclude filter, then we need to check for a match.
        return !isIncluded || !!excludeFilters?.some((m) => m.match(filePath));
      };

      if (isLocalProject) {
        return excludeFileByPatterns(
          filePath,
          sourceProjectConfiguration?.patternsToInclude,
          sourceProjectConfiguration?.patternsToExclude
        );
      } else {
        if (!packagesJson) {
          return false;
        }
        const dependenciesConfigurations: IExtractorDependencyConfiguration[] | undefined =
          dependencyConfigurationsByName.get(packagesJson.name);
        if (!dependenciesConfigurations) {
          return false;
        }
        const matchedDependenciesConfigurations: IExtractorDependencyConfiguration[] =
          dependenciesConfigurations.filter((d) =>
            semver.satisfies(packagesJson.version, d.dependencyVersionRange)
          );
        return matchedDependenciesConfigurations.some((d) =>
          excludeFileByPatterns(filePath, d.patternsToInclude, d.patternsToExclude)
        );
      }
    };

    if (sourceProjectConfiguration && !includeNpmIgnoreFiles) {
      // Only use the npmignore filter if the project configuration explicitly asks for it
      useNpmIgnoreFilter = true;
    }

    const targetFolderPath: string = this._remapPathForExtractorFolder(sourceFolderPath, options);

    if (useNpmIgnoreFilter) {
      const npmPackFiles: string[] = await PackageExtractor.getPackageIncludedFilesAsync(sourceFolderPath);

      const alreadyCopiedSourcePaths: Set<string> = new Set();

      await Async.forEachAsync(
        npmPackFiles,
        async (npmPackFile: string) => {
          // In issue https://github.com/microsoft/rushstack/issues/2121 we found that npm-packlist sometimes returns
          // duplicate file paths, for example:
          //
          //   'dist//index.js'
          //   'dist/index.js'
          //

          // Filter out files that are excluded by the project configuration or dependency configuration.
          if (isFileExcluded(npmPackFile)) {
            return;
          }

          // We can detect the duplicates by comparing the path.resolve() result.
          const copySourcePath: string = path.resolve(sourceFolderPath, npmPackFile);

          if (alreadyCopiedSourcePaths.has(copySourcePath)) {
            return;
          }
          alreadyCopiedSourcePaths.add(copySourcePath);

          const copyDestinationPath: string = path.join(targetFolderPath, npmPackFile);

          const copySourcePathNode: PathNode = await state.symlinkAnalyzer.analyzePathAsync(copySourcePath);
          if (copySourcePathNode.kind !== 'link') {
            if (!options.createArchiveOnly) {
              await FileSystem.ensureFolderAsync(path.dirname(copyDestinationPath));
              // Use the fs.copyFile API instead of FileSystem.copyFileAsync() since copyFileAsync performs
              // a needless stat() call to determine if it's a file or folder, and we already know it's a file.
              await fs.promises.copyFile(copySourcePath, copyDestinationPath, fs.constants.COPYFILE_EXCL);
            }

            if (archiver) {
              const archivePath: string = path.relative(targetRootFolder, copyDestinationPath);
              await archiver.addToArchiveAsync({
                filePath: copySourcePath,
                archivePath,
                stats: copySourcePathNode.linkStats
              });
            }
          }
        },
        {
          concurrency: 10
        }
      );
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

      // Do a breadth-first search of the source folder, copying each file to the target folder
      const queue: AsyncQueue<string> = new AsyncQueue([sourceFolderPath]);
      await Async.forEachAsync(
        queue,
        async ([sourcePath, callback]: [string, () => void]) => {
          const relativeSourcePath: string = path.relative(sourceFolderPath, sourcePath);
          if (relativeSourcePath !== '' && ignoreFilter.ignores(relativeSourcePath)) {
            callback();
            return;
          }

          const sourcePathNode: PathNode = await state.symlinkAnalyzer.analyzePathAsync(sourcePath);
          if (sourcePathNode.kind === 'file') {
            // Only ignore files and not folders to ensure that we traverse the contents of all folders. This is
            // done so that we can match against subfolder patterns, ex. "src/subfolder/**/*"
            if (relativeSourcePath !== '' && isFileExcluded(relativeSourcePath)) {
              callback();
              return;
            }

            const targetPath: string = path.join(targetFolderPath, relativeSourcePath);
            if (!options.createArchiveOnly) {
              // Manually call fs.copyFile to avoid unnecessary stat calls.
              const targetParentPath: string = path.dirname(targetPath);
              await FileSystem.ensureFolderAsync(targetParentPath);
              await fs.promises.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
            }

            // Add the file to the archive. Only need to add files since directories will be auto-created
            if (archiver) {
              const archivePath: string = path.relative(targetRootFolder, targetPath);
              await archiver.addToArchiveAsync({
                filePath: sourcePath,
                archivePath: archivePath,
                stats: sourcePathNode.linkStats
              });
            }
          } else if (sourcePathNode.kind === 'folder') {
            const children: string[] = await FileSystem.readFolderItemNamesAsync(sourcePath);
            for (const child of children) {
              queue.push(path.join(sourcePath, child));
            }
          }

          callback();
        },
        {
          concurrency: 10
        }
      );
    }
  }

  /**
   * Create a symlink as described by the ILinkInfo object.
   */
  private async _extractSymlinkAsync(
    originalLinkInfo: ILinkInfo,
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const linkInfo: ILinkInfo = {
      kind: originalLinkInfo.kind,
      linkPath: this._remapPathForExtractorFolder(originalLinkInfo.linkPath, options),
      targetPath: this._remapPathForExtractorFolder(originalLinkInfo.targetPath, options)
    };

    const newLinkFolder: string = path.dirname(linkInfo.linkPath);
    await FileSystem.ensureFolderAsync(newLinkFolder);

    // Link to the relative path for symlinks
    const relativeTargetPath: string = path.relative(newLinkFolder, linkInfo.targetPath);

    // NOTE: This logic is based on NpmLinkManager._createSymlink()
    if (linkInfo.kind === 'fileLink') {
      // For files, we use a Windows "hard link", because creating a symbolic link requires
      // administrator permission. However hard links seem to cause build failures on Mac,
      // so for all other operating systems we use symbolic links for this case.
      if (process.platform === 'win32') {
        await FileSystem.createHardLinkAsync({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      } else {
        await FileSystem.createSymbolicLinkFileAsync({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      }
    } else {
      // Junctions are only supported on Windows. This will create a symbolic link on other platforms.
      await FileSystem.createSymbolicLinkJunctionAsync({
        linkTargetPath: relativeTargetPath,
        newLinkPath: linkInfo.linkPath
      });
    }

    // Since the created symlinks have the required relative paths, they can be added directly to
    // the archive.
    await state.archiver?.addToArchiveAsync({
      filePath: linkInfo.linkPath,
      archivePath: path.relative(options.targetRootFolder, linkInfo.linkPath)
    });
  }

  /**
   * Write the common/deploy/deploy-metadata.json file.
   */
  private async _writeExtractorMetadataAsync(
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const { mainProjectName, targetRootFolder } = options;
    const { projectConfigurationsByPath } = state;

    const extractorMetadataFileName: string = 'extractor-metadata.json';
    const extractorMetadataFilePath: string = path.join(targetRootFolder, extractorMetadataFileName);
    const extractorMetadataJson: IExtractorMetadataJson = {
      mainProjectName,
      projects: [],
      links: []
    };

    for (const { projectFolder, projectName } of projectConfigurationsByPath.values()) {
      if (state.foldersToCopy.has(projectFolder)) {
        extractorMetadataJson.projects.push({
          projectName,
          path: this._remapPathForExtractorMetadata(projectFolder, options)
        });
      }
    }

    // Remap the links to be relative to target folder
    for (const absoluteLinkInfo of state.symlinkAnalyzer.reportSymlinks()) {
      const relativeInfo: ILinkInfo = {
        kind: absoluteLinkInfo.kind,
        linkPath: this._remapPathForExtractorMetadata(absoluteLinkInfo.linkPath, options),
        targetPath: this._remapPathForExtractorMetadata(absoluteLinkInfo.targetPath, options)
      };
      extractorMetadataJson.links.push(relativeInfo);
    }

    const extractorMetadataFileContent: string = JSON.stringify(extractorMetadataJson, undefined, 0);
    if (!options.createArchiveOnly) {
      await FileSystem.writeFileAsync(extractorMetadataFilePath, extractorMetadataFileContent);
    }
    await state.archiver?.addToArchiveAsync({
      fileData: extractorMetadataFileContent,
      archivePath: extractorMetadataFileName
    });
  }

  private async _makeBinLinksAsync(options: IExtractorOptions, state: IExtractorState): Promise<void> {
    const { terminal } = options;

    const extractedProjectFolders: string[] = Array.from(state.projectConfigurationsByPath.keys()).filter(
      (folderPath: string) => state.foldersToCopy.has(folderPath)
    );

    await Async.forEachAsync(
      extractedProjectFolders,
      async (projectFolder: string) => {
        const extractedProjectFolder: string = this._remapPathForExtractorFolder(projectFolder, options);
        const extractedProjectNodeModulesFolder: string = path.join(extractedProjectFolder, 'node_modules');
        const extractedProjectBinFolder: string = path.join(extractedProjectNodeModulesFolder, '.bin');

        const linkedBinPackageNames: string[] = await pnpmLinkBins(
          extractedProjectNodeModulesFolder,
          extractedProjectBinFolder,
          {
            warn: (msg: string) => terminal.writeLine(Colors.yellow(msg))
          }
        );

        if (linkedBinPackageNames.length && state.archiver) {
          const binFolderItems: string[] = await FileSystem.readFolderItemNamesAsync(
            extractedProjectBinFolder
          );
          for (const binFolderItem of binFolderItems) {
            const binFilePath: string = path.join(extractedProjectBinFolder, binFolderItem);
            await state.archiver.addToArchiveAsync({
              filePath: binFilePath,
              archivePath: path.relative(options.targetRootFolder, binFilePath)
            });
          }
        }
      },
      {
        concurrency: 10
      }
    );
  }
}
