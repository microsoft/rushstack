// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Minimatch } from 'minimatch';
import semver from 'semver';
import npmPacklist from 'npm-packlist';
import ignore, { type Ignore } from 'ignore';

import {
  Async,
  AsyncQueue,
  Path,
  FileSystem,
  Import,
  JsonFile,
  type IPackageJson
} from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import { SymlinkAnalyzer, type ILinkInfo, type PathNode } from './SymlinkAnalyzer';
import { AssetHandler } from './AssetHandler';
import {
  matchesWithStar,
  remapSourcePathForTargetFolder,
  remapPathForExtractorMetadata,
  makeBinLinksAsync
} from './Utils';
import {
  CREATE_LINKS_SCRIPT_FILENAME,
  EXTRACTOR_METADATA_FILENAME,
  SCRIPTS_FOLDER_PATH
} from './PathConstants';
import { MAX_CONCURRENCY } from './scripts/createLinks/utilities/constants';

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

export const TARGET_ROOT_SCRIPT_RELATIVE_PATH_TEMPLATE_STRING: '{TARGET_ROOT_SCRIPT_RELATIVE_PATH}' =
  '{TARGET_ROOT_SCRIPT_RELATIVE_PATH}';

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
  /**
   * A list of all files that are part of the extracted project.
   */
  files: string[];
}

/**
 * The extractor subspace configurations
 *
 * @public
 */
export interface IExtractorSubspace {
  /**
   * The subspace name
   */
  subspaceName: string;
  /**
   * The folder where the PNPM "node_modules" folder is located. This is used to resolve packages linked
   * to the PNPM virtual store.
   */
  pnpmInstallFolder?: string;
  /**
   * The pnpmfile configuration if using PNPM, otherwise undefined. The configuration will be used to
   * transform the package.json prior to extraction.
   */
  transformPackageJson?: (packageJson: IPackageJson) => IPackageJson;
}

interface IExtractorState {
  foldersToCopy: Set<string>;
  packageJsonByPath: Map<string, IPackageJson>;
  projectConfigurationsByPath: Map<string, IExtractorProjectConfiguration>;
  projectConfigurationsByName: Map<string, IExtractorProjectConfiguration>;
  dependencyConfigurationsByName: Map<string, IExtractorDependencyConfiguration[]>;
  symlinkAnalyzer: SymlinkAnalyzer;
  assetHandler: AssetHandler;
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
 * The mode to use for link creation.
 *
 * @public
 */
export type LinkCreationMode = 'default' | 'script' | 'none';

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
   * archive. This is only supported when {@link IExtractorOptions.linkCreation} is 'script' or 'none'.
   */
  createArchiveOnly?: boolean;

  /**
   * The pnpmfile configuration if using PNPM, otherwise `undefined`. The configuration will be used to
   * transform the package.json prior to extraction.
   *
   * @remarks
   * When Rush subspaces are enabled, this setting applies to `default` subspace only.  To configure
   * each subspace, use the {@link IExtractorOptions.subspaces} array instead.  The two approaches
   * cannot be combined.
   */
  transformPackageJson?: (packageJson: IPackageJson) => IPackageJson;

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
   *
   * @remarks
   * When Rush subspaces are enabled, this setting applies to `default` subspace only.  To configure
   * each subspace, use the {@link IExtractorOptions.subspaces} array instead.  The two approaches
   * cannot be combined.
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
  linkCreation?: LinkCreationMode;

  /**
   * The path to the generated link creation script. This is only used when {@link IExtractorOptions.linkCreation}
   * is 'script'.
   */
  linkCreationScriptPath?: string;

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

  /**
   * When using Rush subspaces, this setting can be used to provide configuration information for each
   * individual subspace.
   *
   * @remarks
   * To avoid confusion, if this setting is used, then the {@link IExtractorOptions.transformPackageJson} and
   * {@link IExtractorOptions.pnpmInstallFolder} settings must not be used.
   */
  subspaces?: IExtractorSubspace[];
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
    options = PackageExtractor._normalizeOptions(options);
    const {
      terminal,
      projectConfigurations,
      sourceRootFolder,
      targetRootFolder,
      mainProjectName,
      overwriteExisting,
      dependencyConfigurations,
      linkCreation
    } = options;

    terminal.writeLine(Colorize.cyan(`Extracting to target folder:  ${targetRootFolder}`));
    terminal.writeLine(Colorize.cyan(`Main project for extraction: ${mainProjectName}`));

    await FileSystem.ensureFolderAsync(targetRootFolder);
    const existingExtraction: boolean =
      (await FileSystem.readFolderItemNamesAsync(targetRootFolder)).length > 0;
    if (existingExtraction) {
      if (!overwriteExisting) {
        throw new Error('The extraction target folder is not empty. Overwrite must be explicitly requested');
      }
      terminal.writeLine('Deleting target folder contents...');
      terminal.writeLine('');
      await FileSystem.ensureEmptyFolderAsync(targetRootFolder);
    }

    // Create a new state for each run
    const symlinkAnalyzer: SymlinkAnalyzer = new SymlinkAnalyzer({
      requiredSourceParentPath: sourceRootFolder
    });
    const state: IExtractorState = {
      symlinkAnalyzer,
      assetHandler: new AssetHandler({ ...options, symlinkAnalyzer }),
      foldersToCopy: new Set(),
      packageJsonByPath: new Map(),
      projectConfigurationsByName: new Map(projectConfigurations.map((p) => [p.projectName, p])),
      projectConfigurationsByPath: new Map(projectConfigurations.map((p) => [p.projectFolder, p])),
      dependencyConfigurationsByName: new Map()
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
    await state.assetHandler.finalizeAsync({
      onAfterExtractSymlinksAsync: async () => {
        // We need the symlinks to be created before attempting to create the bin links, since it requires
        // the node_modules folder to be realized. While we're here, we may as well perform some specific
        // link creation tasks and write the extractor-metadata.json file before the asset handler finalizes.
        if (linkCreation === 'default') {
          await this._makeBinLinksAsync(options, state);
        } else if (linkCreation === 'script') {
          await this._writeCreateLinksScriptAsync(options, state);
        }

        terminal.writeLine('Creating extractor-metadata.json');
        await this._writeExtractorMetadataAsync(options, state);
      }
    });
  }

  private static _normalizeOptions(options: IExtractorOptions): IExtractorOptions {
    if (options.subspaces) {
      if (options.pnpmInstallFolder !== undefined) {
        throw new Error(
          'IExtractorOptions.pnpmInstallFolder cannot be combined with IExtractorOptions.subspaces'
        );
      }
      if (options.transformPackageJson !== undefined) {
        throw new Error(
          'IExtractorOptions.transformPackageJson cannot be combined with IExtractorOptions.subspaces'
        );
      }
      return options;
    }

    const normalizedOptions: IExtractorOptions = { ...options };
    delete normalizedOptions.pnpmInstallFolder;
    delete normalizedOptions.transformPackageJson;

    normalizedOptions.subspaces = [
      {
        subspaceName: 'default',
        pnpmInstallFolder: options.pnpmInstallFolder,
        transformPackageJson: options.transformPackageJson
      }
    ];

    return normalizedOptions;
  }

  private async _performExtractionAsync(options: IExtractorOptions, state: IExtractorState): Promise<void> {
    const {
      terminal,
      mainProjectName,
      sourceRootFolder,
      targetRootFolder,
      folderToCopy: additionalFolderToCopy,
      createArchiveOnly
    } = options;
    const { projectConfigurationsByName, foldersToCopy } = state;

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
      terminal.writeLine(Colorize.cyan(`Analyzing project: ${projectName}`));
      await this._collectFoldersAsync(projectFolder, options, state);
    }

    if (!createArchiveOnly) {
      terminal.writeLine(`Copying folders to target folder "${targetRootFolder}"`);
    }
    await Async.forEachAsync(
      foldersToCopy,
      async (folderToCopy: string) => {
        await this._extractFolderAsync(folderToCopy, options, state);
      },
      {
        concurrency: MAX_CONCURRENCY
      }
    );

    if (additionalFolderToCopy) {
      // Copy the additional folder directly into the root of the target folder by setting the sourceRootFolder
      // to the root of the folderToCopy
      const additionalFolderPath: string = path.resolve(sourceRootFolder, additionalFolderToCopy);
      const additionalFolderExtractorOptions: IExtractorOptions = {
        ...options,
        sourceRootFolder: additionalFolderPath,
        targetRootFolder
      };
      await this._extractFolderAsync(additionalFolderPath, additionalFolderExtractorOptions, state);
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
    const { terminal, subspaces } = options;
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

        const targetSubspace: IExtractorSubspace | undefined = subspaces?.find(
          (subspace) =>
            subspace.pnpmInstallFolder && Path.isUnder(packageJsonFolderPath, subspace.pnpmInstallFolder)
        );

        // Transform packageJson using the provided transformer, if requested
        const packageJson: IPackageJson =
          targetSubspace?.transformPackageJson?.(originalPackageJson) ?? originalPackageJson;

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
                  return (await state.symlinkAnalyzer.analyzePathAsync({ inputPath: filePath })).nodePath;
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
        const realPnpmInstallFolder: string | undefined = targetSubspace?.pnpmInstallFolder;
        if (realPnpmInstallFolder && Path.isUnder(packageJsonFolderPath, realPnpmInstallFolder)) {
          try {
            // The PNPM virtual store links are created in this folder.  We will resolve the current package
            // from that location and collect any additional links encountered along the way.
            // TODO: This can be configured via NPMRC. We should support that.
            const pnpmDotFolderPath: string = path.join(realPnpmInstallFolder, 'node_modules', '.pnpm');

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
                  return (await state.symlinkAnalyzer.analyzePathAsync({ inputPath: filePath })).nodePath;
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
            // eslint-disable-next-line no-console
            console.log('Ignoring missing PNPM virtual store link for ' + packageJsonFolderPath);
          }
        }

        callback();
      },
      {
        concurrency: MAX_CONCURRENCY
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
   * Copy one package folder to the extractor target folder.
   */
  private async _extractFolderAsync(
    sourceFolderPath: string,
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const { includeNpmIgnoreFiles } = options;
    const { projectConfigurationsByPath, packageJsonByPath, dependencyConfigurationsByName, assetHandler } =
      state;
    let useNpmIgnoreFilter: boolean = false;

    const sourceFolderRealPath: string = await FileSystem.getRealPathAsync(sourceFolderPath);
    const sourceProjectConfiguration: IExtractorProjectConfiguration | undefined =
      projectConfigurationsByPath.get(sourceFolderRealPath);

    const packagesJson: IPackageJson | undefined = packageJsonByPath.get(sourceFolderRealPath);
    // As this function will be used to copy folder for both project inside monorepo and third party
    // dependencies insides node_modules. Third party dependencies won't have project configurations
    const isLocalProject: boolean = !!sourceProjectConfiguration;

    // Function to filter files inside local project or third party dependencies.
    const isFileExcluded = (filePath: string): boolean => {
      // Encapsulate exclude logic into a function, so it can be reused.
      const excludeFileByPatterns = (
        patternsToInclude: string[] | undefined,
        patternsToExclude: string[] | undefined
      ): boolean => {
        let includeFilters: Minimatch[] | undefined;
        let excludeFilters: Minimatch[] | undefined;
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
          excludeFileByPatterns(d.patternsToInclude, d.patternsToExclude)
        );
      }
    };

    if (sourceProjectConfiguration && !includeNpmIgnoreFiles) {
      // Only use the npmignore filter if the project configuration explicitly asks for it
      useNpmIgnoreFilter = true;
    }

    const targetFolderPath: string = remapSourcePathForTargetFolder({
      ...options,
      sourcePath: sourceFolderPath
    });
    if (useNpmIgnoreFilter) {
      const npmPackFiles: string[] = await PackageExtractor.getPackageIncludedFilesAsync(sourceFolderPath);
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

          const sourceFilePath: string = path.resolve(sourceFolderPath, npmPackFile);
          const { kind, linkStats: sourceFileStats } = await state.symlinkAnalyzer.analyzePathAsync({
            inputPath: sourceFilePath
          });
          if (kind === 'file') {
            const targetFilePath: string = path.resolve(targetFolderPath, npmPackFile);
            await assetHandler.includeAssetAsync({
              sourceFilePath,
              sourceFileStats,
              targetFilePath
            });
          }
        },
        {
          concurrency: MAX_CONCURRENCY
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

          const sourcePathNode: PathNode | undefined = await state.symlinkAnalyzer.analyzePathAsync({
            inputPath: sourcePath,
            // Treat all links to external paths as if they are files for this scenario. In the future, we may
            // want to explore the target of the external link to see if all files within the target are
            // excluded, and throw if they are not.
            shouldIgnoreExternalLink: (linkSourcePath: string) => {
              // Ignore the provided linkSourcePath since it may not be the first link in the chain. Instead,
              // we will consider only the relativeSourcePath, since that would be our entrypoint into the
              // link chain.
              return isFileExcluded(relativeSourcePath);
            }
          });

          if (sourcePathNode === undefined) {
            // The target was a symlink that is excluded. We don't need to do anything.
            callback();
            return;
          } else if (sourcePathNode.kind === 'file') {
            // Only ignore files and not folders to ensure that we traverse the contents of all folders. This is
            // done so that we can match against subfolder patterns, ex. "src/subfolder/**/*"
            if (relativeSourcePath !== '' && isFileExcluded(relativeSourcePath)) {
              callback();
              return;
            }

            const targetFilePath: string = path.resolve(targetFolderPath, relativeSourcePath);
            await assetHandler.includeAssetAsync({
              sourceFilePath: sourcePath,
              sourceFileStats: sourcePathNode.linkStats,
              targetFilePath
            });
          } else if (sourcePathNode.kind === 'folder') {
            const children: string[] = await FileSystem.readFolderItemNamesAsync(sourcePath);
            for (const child of children) {
              queue.push(path.join(sourcePath, child));
            }
          }

          callback();
        },
        {
          concurrency: MAX_CONCURRENCY
        }
      );
    }
  }

  /**
   * Write the common/deploy/deploy-metadata.json file.
   */
  private async _writeExtractorMetadataAsync(
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const { mainProjectName, sourceRootFolder, targetRootFolder, linkCreation, linkCreationScriptPath } =
      options;
    const { projectConfigurationsByPath } = state;

    const extractorMetadataFolderPath: string =
      linkCreation === 'script' && linkCreationScriptPath
        ? path.dirname(path.resolve(targetRootFolder, linkCreationScriptPath))
        : targetRootFolder;
    const extractorMetadataFilePath: string = path.join(
      extractorMetadataFolderPath,
      EXTRACTOR_METADATA_FILENAME
    );
    const extractorMetadataJson: IExtractorMetadataJson = {
      mainProjectName,
      projects: [],
      links: [],
      files: []
    };

    for (const { projectFolder, projectName } of projectConfigurationsByPath.values()) {
      if (state.foldersToCopy.has(projectFolder)) {
        extractorMetadataJson.projects.push({
          projectName,
          path: remapPathForExtractorMetadata(sourceRootFolder, projectFolder)
        });
      }
    }

    // Remap the links to be relative to target folder
    for (const { kind, linkPath, targetPath } of state.symlinkAnalyzer.reportSymlinks()) {
      extractorMetadataJson.links.push({
        kind,
        linkPath: remapPathForExtractorMetadata(sourceRootFolder, linkPath),
        targetPath: remapPathForExtractorMetadata(sourceRootFolder, targetPath)
      });
    }

    for (const assetPath of state.assetHandler.assetPaths) {
      extractorMetadataJson.files.push(remapPathForExtractorMetadata(targetRootFolder, assetPath));
    }

    const extractorMetadataFileContent: string = JSON.stringify(extractorMetadataJson, undefined, 0);
    await state.assetHandler.includeAssetAsync({
      sourceFileContent: extractorMetadataFileContent,
      targetFilePath: extractorMetadataFilePath
    });
  }

  private async _makeBinLinksAsync(options: IExtractorOptions, state: IExtractorState): Promise<void> {
    const { terminal } = options;

    const extractedProjectFolderPaths: string[] = [];
    for (const folderPath of state.projectConfigurationsByPath.keys()) {
      if (state.foldersToCopy.has(folderPath)) {
        extractedProjectFolderPaths.push(
          remapSourcePathForTargetFolder({ ...options, sourcePath: folderPath })
        );
      }
    }

    const binFilePaths: string[] = await makeBinLinksAsync(terminal, extractedProjectFolderPaths);
    await Async.forEachAsync(
      binFilePaths,
      (targetFilePath: string) => state.assetHandler.includeAssetAsync({ targetFilePath }),
      {
        concurrency: MAX_CONCURRENCY
      }
    );
  }

  private async _writeCreateLinksScriptAsync(
    options: IExtractorOptions,
    state: IExtractorState
  ): Promise<void> {
    const { terminal, targetRootFolder, linkCreationScriptPath } = options;
    const { assetHandler } = state;

    terminal.writeLine(`Creating ${CREATE_LINKS_SCRIPT_FILENAME}`);
    const createLinksSourceFilePath: string = `${SCRIPTS_FOLDER_PATH}/${CREATE_LINKS_SCRIPT_FILENAME}`;
    const createLinksTargetFilePath: string = path.resolve(
      targetRootFolder,
      linkCreationScriptPath || CREATE_LINKS_SCRIPT_FILENAME
    );
    let createLinksScriptContent: string = await FileSystem.readFileAsync(createLinksSourceFilePath);
    createLinksScriptContent = createLinksScriptContent.replace(
      TARGET_ROOT_SCRIPT_RELATIVE_PATH_TEMPLATE_STRING,
      Path.convertToSlashes(path.relative(path.dirname(createLinksTargetFilePath), targetRootFolder))
    );
    await assetHandler.includeAssetAsync({
      sourceFileContent: createLinksScriptContent,
      targetFilePath: createLinksTargetFilePath
    });
  }
}
