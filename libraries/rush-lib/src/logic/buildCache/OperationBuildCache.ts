// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { FileSystem, type FolderItem, InternalError, Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import type { ICloudBuildCacheProvider } from './ICloudBuildCacheProvider';
import type { FileSystemBuildCacheProvider } from './FileSystemBuildCacheProvider';
import { TarExecutable } from '../../utilities/TarExecutable';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import type { IOperationExecutionResult } from '../operations/IOperationExecutionResult';

/**
 * @internal
 */
export interface IOperationBuildCacheOptions {
  /**
   * The repo-wide configuration for the build cache.
   */
  buildCacheConfiguration: BuildCacheConfiguration;
  /**
   * The terminal to use for logging.
   */
  terminal: ITerminal;
  /**
   * If true, omit AppleDouble (`._*`) files from cache archives when running on macOS
   * and a companion file exists in the same directory.
   */
  filterAppleDoubleFiles: boolean;
}

/**
 * @internal
 */
export type IProjectBuildCacheOptions = IOperationBuildCacheOptions & {
  /**
   * Value from rush-project.json
   */
  projectOutputFolderNames: ReadonlyArray<string>;
  /**
   * The project to be cached.
   */
  project: RushConfigurationProject;
  /**
   * The hash of all relevant inputs and configuration that uniquely identifies this execution.
   */
  operationStateHash: string;
  /**
   * The name of the phase that is being cached.
   */
  phaseName: string;
};

interface IPathsToCache {
  filteredOutputFolderNames: string[];
  outputFilePaths: string[];
}

/**
 * @internal
 */
export class OperationBuildCache {
  private static _tarUtilityPromise: Promise<TarExecutable | undefined> | undefined;

  private readonly _project: RushConfigurationProject;
  private readonly _localBuildCacheProvider: FileSystemBuildCacheProvider;
  private readonly _cloudBuildCacheProvider: ICloudBuildCacheProvider | undefined;
  private readonly _buildCacheEnabled: boolean;
  private readonly _cacheWriteEnabled: boolean;
  private readonly _projectOutputFolderNames: ReadonlyArray<string>;
  private readonly _cacheId: string | undefined;
  private readonly _filterAppleDoubleFiles: boolean;

  private constructor(cacheId: string | undefined, options: IProjectBuildCacheOptions) {
    const {
      buildCacheConfiguration: {
        localCacheProvider,
        cloudCacheProvider,
        buildCacheEnabled,
        cacheWriteEnabled
      },
      project,
      projectOutputFolderNames,
      filterAppleDoubleFiles
    } = options;
    this._project = project;
    this._localBuildCacheProvider = localCacheProvider;
    this._cloudBuildCacheProvider = cloudCacheProvider;
    this._buildCacheEnabled = buildCacheEnabled;
    this._cacheWriteEnabled = cacheWriteEnabled;
    this._projectOutputFolderNames = projectOutputFolderNames || [];
    this._cacheId = cacheId;
    this._filterAppleDoubleFiles = filterAppleDoubleFiles && process.platform === 'darwin';
  }

  private static _tryGetTarUtility(terminal: ITerminal): Promise<TarExecutable | undefined> {
    if (!OperationBuildCache._tarUtilityPromise) {
      OperationBuildCache._tarUtilityPromise = TarExecutable.tryInitializeAsync(terminal);
    }

    return OperationBuildCache._tarUtilityPromise;
  }

  public get cacheId(): string | undefined {
    return this._cacheId;
  }

  public static getOperationBuildCache(options: IProjectBuildCacheOptions): OperationBuildCache {
    const cacheId: string | undefined = OperationBuildCache._getCacheId(options);
    return new OperationBuildCache(cacheId, options);
  }

  public static forOperation(
    executionResult: IOperationExecutionResult,
    options: IOperationBuildCacheOptions
  ): OperationBuildCache {
    const { buildCacheConfiguration, terminal, filterAppleDoubleFiles } = options;
    const outputFolders: string[] = [...(executionResult.operation.settings?.outputFolderNames ?? [])];
    if (executionResult.metadataFolderPath) {
      outputFolders.push(executionResult.metadataFolderPath);
    }

    const buildCacheOptions: IProjectBuildCacheOptions = {
      buildCacheConfiguration,
      terminal,
      project: executionResult.operation.associatedProject,
      phaseName: executionResult.operation.associatedPhase.name,
      projectOutputFolderNames: outputFolders,
      operationStateHash: executionResult.getStateHash(),
      filterAppleDoubleFiles
    };
    const cacheId: string | undefined = OperationBuildCache._getCacheId(buildCacheOptions);
    return new OperationBuildCache(cacheId, buildCacheOptions);
  }

  public async tryRestoreFromCacheAsync(terminal: ITerminal, specifiedCacheId?: string): Promise<boolean> {
    const cacheId: string | undefined = specifiedCacheId || this._cacheId;
    if (!cacheId) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    if (!this._buildCacheEnabled) {
      // Skip reading local and cloud build caches, without any noise
      return false;
    }

    let localCacheEntryPath: string | undefined =
      await this._localBuildCacheProvider.tryGetCacheEntryPathByIdAsync(terminal, cacheId);
    let cacheEntryBuffer: Buffer | undefined;
    let updateLocalCacheSuccess: boolean | undefined;
    if (!localCacheEntryPath && this._cloudBuildCacheProvider) {
      terminal.writeVerboseLine(
        'This project was not found in the local build cache. Querying the cloud build cache.'
      );

      cacheEntryBuffer = await this._cloudBuildCacheProvider.tryGetCacheEntryBufferByIdAsync(
        terminal,
        cacheId
      );
      if (cacheEntryBuffer) {
        try {
          localCacheEntryPath = await this._localBuildCacheProvider.trySetCacheEntryBufferAsync(
            terminal,
            cacheId,
            cacheEntryBuffer
          );
          updateLocalCacheSuccess = true;
        } catch (e) {
          updateLocalCacheSuccess = false;
        }
      }
    }

    if (!localCacheEntryPath && !cacheEntryBuffer) {
      terminal.writeVerboseLine('This project was not found in the build cache.');
      return false;
    }

    terminal.writeLine('Build cache hit.');
    terminal.writeVerboseLine(`Cache key: ${cacheId}`);

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    terminal.writeVerboseLine(`Clearing cached folders: ${this._projectOutputFolderNames.join(', ')}`);
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(`${projectFolderPath}/${outputFolderName}`)
      )
    );

    const tarUtility: TarExecutable | undefined = await OperationBuildCache._tryGetTarUtility(terminal);
    let restoreSuccess: boolean = false;
    if (tarUtility && localCacheEntryPath) {
      const logFilePath: string = this._getTarLogFilePath(cacheId, 'untar');
      const tarExitCode: number = await tarUtility.tryUntarAsync({
        archivePath: localCacheEntryPath,
        outputFolderPath: projectFolderPath,
        logFilePath
      });
      if (tarExitCode === 0) {
        restoreSuccess = true;
        terminal.writeLine('Successfully restored output from the build cache.');
      } else {
        terminal.writeWarningLine(
          'Unable to restore output from the build cache. ' +
            `See "${logFilePath}" for logs from the tar process.`
        );
      }
    }

    if (updateLocalCacheSuccess === false) {
      terminal.writeWarningLine('Unable to update the local build cache with data from the cloud cache.');
    }

    return restoreSuccess;
  }

  public async trySetCacheEntryAsync(terminal: ITerminal, specifiedCacheId?: string): Promise<boolean> {
    if (!this._cacheWriteEnabled) {
      // Skip writing local and cloud build caches, without any noise
      return true;
    }

    const cacheId: string | undefined = specifiedCacheId || this._cacheId;
    if (!cacheId) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    const filesToCache: IPathsToCache | undefined = await this._tryCollectPathsToCacheAsync(terminal);
    if (!filesToCache) {
      return false;
    }

    terminal.writeVerboseLine(
      `Caching build output folders: ${filesToCache.filteredOutputFolderNames.join(', ')}`
    );

    let localCacheEntryPath: string | undefined;

    const tarUtility: TarExecutable | undefined = await OperationBuildCache._tryGetTarUtility(terminal);
    if (tarUtility) {
      const finalLocalCacheEntryPath: string = this._localBuildCacheProvider.getCacheEntryPath(cacheId);

      // Derive the temp file from the destination path to ensure they are on the same volume
      // In the case of a shared network drive containing the build cache, we also need to make
      // sure the the temp path won't be shared by two parallel rush builds.
      const randomSuffix: string = crypto.randomBytes(8).toString('hex');
      const tempLocalCacheEntryPath: string = `${finalLocalCacheEntryPath}-${randomSuffix}.temp`;

      const logFilePath: string = this._getTarLogFilePath(cacheId, 'tar');
      const tarExitCode: number = await tarUtility.tryCreateArchiveFromProjectPathsAsync({
        archivePath: tempLocalCacheEntryPath,
        paths: filesToCache.outputFilePaths,
        project: this._project,
        logFilePath
      });

      if (tarExitCode === 0) {
        // Move after the archive is finished so that if the process is interrupted we aren't left with an invalid file
        try {
          await Async.runWithRetriesAsync({
            action: () =>
              FileSystem.moveAsync({
                sourcePath: tempLocalCacheEntryPath,
                destinationPath: finalLocalCacheEntryPath,
                overwrite: true
              }),
            maxRetries: 2,
            retryDelayMs: 500
          });
        } catch (moveError) {
          try {
            await FileSystem.deleteFileAsync(tempLocalCacheEntryPath);
          } catch (deleteError) {
            // Ignored
          }
          throw moveError;
        }
        localCacheEntryPath = finalLocalCacheEntryPath;
      } else {
        terminal.writeWarningLine(
          `"tar" exited with code ${tarExitCode} while attempting to create the cache entry. ` +
            `See "${logFilePath}" for logs from the tar process.`
        );
        return false;
      }
    } else {
      terminal.writeWarningLine(
        `Unable to locate "tar". Please ensure that "tar" is on your PATH environment variable, or set the ` +
          `${EnvironmentVariableNames.RUSH_TAR_BINARY_PATH} environment variable to the full path to the "tar" binary.`
      );
      return false;
    }

    let cacheEntryBuffer: Buffer | undefined;

    let setCloudCacheEntryPromise: Promise<boolean> | undefined;

    // Note that "writeAllowed" settings (whether in config or environment) always apply to
    // the configured CLOUD cache. If the cache is enabled, rush is always allowed to read from and
    // write to the local build cache.

    if (this._cloudBuildCacheProvider?.isCacheWriteAllowed) {
      if (localCacheEntryPath) {
        cacheEntryBuffer = await FileSystem.readFileToBufferAsync(localCacheEntryPath);
      } else {
        throw new InternalError('Expected the local cache entry path to be set.');
      }

      setCloudCacheEntryPromise = this._cloudBuildCacheProvider?.trySetCacheEntryBufferAsync(
        terminal,
        cacheId,
        cacheEntryBuffer
      );
    }

    const updateCloudCacheSuccess: boolean | undefined = (await setCloudCacheEntryPromise) ?? true;

    const success: boolean = updateCloudCacheSuccess && !!localCacheEntryPath;
    if (success) {
      terminal.writeLine('Successfully set cache entry.');
      terminal.writeVerboseLine(`Cache key: ${cacheId}`);
    } else if (!localCacheEntryPath && updateCloudCacheSuccess) {
      terminal.writeWarningLine('Unable to set local cache entry.');
    } else if (localCacheEntryPath && !updateCloudCacheSuccess) {
      terminal.writeWarningLine('Unable to set cloud cache entry.');
    } else {
      terminal.writeWarningLine('Unable to set both cloud and local cache entries.');
    }

    return success;
  }

  /**
   * Walks the declared output folders of the project and collects a list of files.
   * @returns The list of output files as project-relative paths, or `undefined` if a
   *   symbolic link was encountered.
   */
  private async _tryCollectPathsToCacheAsync(terminal: ITerminal): Promise<IPathsToCache | undefined> {
    const projectFolderPath: string = this._project.projectFolder;
    const outputFilePaths: string[] = [];
    const queue: [string, string][] = [];

    const filteredOutputFolderNames: string[] = [];

    let hasSymbolicLinks: boolean = false;
    const filterAppleDoubleFiles: boolean = this._filterAppleDoubleFiles;

    // Adds child directories to the queue, files to the path list, and bails on symlinks
    function processChildren(relativePath: string, diskPath: string, children: FolderItem[]): void {
      // When filtering AppleDouble files, build a set of sibling names so we can check
      // whether a companion file exists for each ._X file.
      let childNameSet: Set<string> | undefined;
      if (filterAppleDoubleFiles) {
        childNameSet = new Set<string>(children.map(({ name }) => name));
      }

      for (const child of children) {
        const childName: string = child.name;
        const childRelativePath: string = `${relativePath}/${childName}`;
        if (child.isSymbolicLink()) {
          terminal.writeError(
            `Unable to include "${childRelativePath}" in build cache. It is a symbolic link.`
          );
          hasSymbolicLinks = true;
        } else if (child.isDirectory()) {
          queue.push([childRelativePath, `${diskPath}/${child.name}`]);
        } else {
          // Check for macOS AppleDouble files (._X pattern) that have a companion file
          if (childNameSet && childName.length > 2 && childName.startsWith('._')) {
            const companionName: string = childName.substring(2);
            if (childNameSet.has(companionName)) {
              terminal.writeVerboseLine(`Omitting AppleDouble file "${childRelativePath}" from build cache.`);
              continue;
            }
          }

          outputFilePaths.push(childRelativePath);
        }
      }
    }

    // Handle declared output folders.
    for (const outputFolder of this._projectOutputFolderNames) {
      const diskPath: string = `${projectFolderPath}/${outputFolder}`;
      try {
        const children: FolderItem[] = await FileSystem.readFolderItemsAsync(diskPath);
        processChildren(outputFolder, diskPath, children);
        // The folder exists, record it
        filteredOutputFolderNames.push(outputFolder);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
          throw error;
        }

        // If the folder does not exist, ignore it.
      }
    }

    for (const [relativePath, diskPath] of queue) {
      const children: FolderItem[] = await FileSystem.readFolderItemsAsync(diskPath);
      processChildren(relativePath, diskPath, children);
    }

    if (hasSymbolicLinks) {
      // Symbolic links do not round-trip safely.
      return undefined;
    }

    // Ensure stable output path order.
    outputFilePaths.sort();

    return {
      outputFilePaths,
      filteredOutputFolderNames
    };
  }

  private _getTarLogFilePath(cacheId: string, mode: 'tar' | 'untar'): string {
    return path.join(this._project.projectRushTempFolder, `${cacheId}.${mode}.log`);
  }

  private static _getCacheId(options: IProjectBuildCacheOptions): string | undefined {
    const {
      buildCacheConfiguration,
      project: { packageName },
      operationStateHash,
      phaseName
    } = options;
    return buildCacheConfiguration.getCacheEntryId({
      projectName: packageName,
      projectStateHash: operationStateHash,
      phaseName
    });
  }
}
