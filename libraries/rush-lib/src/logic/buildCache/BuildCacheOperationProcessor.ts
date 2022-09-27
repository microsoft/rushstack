// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, ITerminal, FolderItem, InternalError } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { TarExecutable } from '../../utilities/TarExecutable';
import { OperationStatus } from '../operations/OperationStatus';
import { IOperationProcessor } from '../operations/IOperationProcessor';
import { IOperationRunnerContext } from '../operations/IOperationRunner';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';

export interface IProjectBuildCacheOptions {
  buildCacheConfiguration: BuildCacheConfiguration;
  project: RushConfigurationProject;
  phaseName: string;
  outputFolderNames: ReadonlyArray<string>;
}

interface IPathsToCache {
  filteredOutputFolderNames: string[];
  outputFilePaths: string[];
}

export class BuildCacheOperationProcessor implements IOperationProcessor {
  /**
   * null === we haven't tried to initialize yet
   * undefined === unable to initialize
   */
  private static _tarUtilityPromise: Promise<TarExecutable | undefined> | null = null;

  private readonly _buildCacheConfiguration: BuildCacheConfiguration;
  private readonly _project: RushConfigurationProject;
  private readonly _phaseName: string;
  private readonly _outputFolderNames: ReadonlyArray<string>;

  private _cacheId: string | undefined;

  public constructor(options: IProjectBuildCacheOptions) {
    const { buildCacheConfiguration, project, outputFolderNames, phaseName } = options;
    this._buildCacheConfiguration = buildCacheConfiguration;
    this._project = project;
    this._phaseName = phaseName;
    this._outputFolderNames = outputFolderNames;

    this._cacheId = undefined;
  }

  private static _tryGetTarUtility(terminal: ITerminal): Promise<TarExecutable | undefined> {
    if (BuildCacheOperationProcessor._tarUtilityPromise === null) {
      BuildCacheOperationProcessor._tarUtilityPromise = TarExecutable.tryInitializeAsync(terminal);
    }

    return BuildCacheOperationProcessor._tarUtilityPromise;
  }

  public async beforeBuildAsync(
    context: Pick<IOperationRunnerContext, 'stateHash' | 'terminal' | 'isCacheReadAllowed'>
  ): Promise<OperationStatus> {
    const { stateHash, terminal, isCacheReadAllowed } = context;
    if (!stateHash || !isCacheReadAllowed) {
      return OperationStatus.Ready;
    }

    const { _buildCacheConfiguration: buildCacheConfiguration } = this;
    const cacheId: string | undefined = (this._cacheId = buildCacheConfiguration.getCacheEntryId({
      phaseName: this._phaseName,
      projectName: this._project.packageName,
      stateHash
    }));

    if (!cacheId) {
      return OperationStatus.Ready;
    }

    const { localCacheProvider, cloudCacheProvider } = buildCacheConfiguration;

    let localCacheEntryPath: string | undefined = await localCacheProvider.tryGetCacheEntryPathByIdAsync(
      terminal,
      cacheId
    );
    let cacheEntryBuffer: Buffer | undefined;
    let updateLocalCacheSuccess: boolean | undefined;
    if (!localCacheEntryPath && cloudCacheProvider) {
      terminal.writeVerboseLine(
        'This operation was not found in the local build cache. Querying the cloud build cache.'
      );

      cacheEntryBuffer = await cloudCacheProvider.tryGetCacheEntryBufferByIdAsync(terminal, cacheId);
      if (cacheEntryBuffer) {
        try {
          localCacheEntryPath = await localCacheProvider.trySetCacheEntryBufferAsync(
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
      terminal.writeVerboseLine('This operation was not found in the build cache.');
      return OperationStatus.Ready;
    }

    terminal.writeLine('Build cache hit.');
    terminal.writeVerboseLine(cacheId);

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    terminal.writeVerboseLine(`Clearing cached folders: ${this._outputFolderNames.join(', ')}`);
    await Promise.all(
      this._outputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(`${projectFolderPath}/${outputFolderName}`)
      )
    );

    const tarUtility: TarExecutable | undefined = await BuildCacheOperationProcessor._tryGetTarUtility(
      terminal
    );
    let restoreSuccess: boolean = false;
    if (tarUtility && localCacheEntryPath) {
      const logFilePath: string = this._getTarLogFilePath();
      const tarExitCode: number = await tarUtility.tryUntarAsync({
        archivePath: localCacheEntryPath,
        outputFolderPath: projectFolderPath,
        logFilePath
      });
      if (tarExitCode === 0) {
        restoreSuccess = true;
        terminal.writeLine('Successfully restored output from the build cache.');
      } else {
        terminal.writeWarningLine('Unable to restore output from the build cache.');
      }
    }

    if (updateLocalCacheSuccess === false) {
      terminal.writeWarningLine('Unable to update the local build cache with data from the cloud cache.');
    }

    return restoreSuccess ? OperationStatus.FromCache : OperationStatus.Ready;
  }

  public async afterBuildAsync(
    context: Pick<IOperationRunnerContext, 'terminal' | 'isCacheWriteAllowed'>,
    status: OperationStatus
  ): Promise<OperationStatus> {
    const { terminal, isCacheWriteAllowed } = context;
    const { _buildCacheConfiguration: buildCacheConfiguration } = this;

    if (status !== OperationStatus.Success) {
      return status;
    }

    if (!buildCacheConfiguration.cacheWriteEnabled || !isCacheWriteAllowed) {
      // Skip writing local and cloud build caches, without any noise
      return status;
    }

    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      return status;
    }

    const { localCacheProvider, cloudCacheProvider } = buildCacheConfiguration;
    const filesToCache: IPathsToCache | undefined = await this._tryCollectPathsToCacheAsync(terminal);
    if (!filesToCache) {
      return OperationStatus.SuccessWithWarning;
    }

    terminal.writeVerboseLine(
      `Caching build output folders: ${filesToCache.filteredOutputFolderNames.join(', ')}`
    );

    let localCacheEntryPath: string | undefined;

    const tarUtility: TarExecutable | undefined = await BuildCacheOperationProcessor._tryGetTarUtility(
      terminal
    );
    if (tarUtility) {
      const finalLocalCacheEntryPath: string = localCacheProvider.getCacheEntryPath(cacheId);
      // Derive the temp file from the destination path to ensure they are on the same volume
      const tempLocalCacheEntryPath: string = `${finalLocalCacheEntryPath}.temp`;
      const logFilePath: string = this._getTarLogFilePath();
      const tarExitCode: number = await tarUtility.tryCreateArchiveFromProjectPathsAsync({
        archivePath: tempLocalCacheEntryPath,
        paths: filesToCache.outputFilePaths,
        project: this._project,
        logFilePath
      });

      if (tarExitCode === 0) {
        // Move after the archive is finished so that if the process is interrupted we aren't left with an invalid file
        await FileSystem.moveAsync({
          sourcePath: tempLocalCacheEntryPath,
          destinationPath: finalLocalCacheEntryPath,
          overwrite: true
        });
        localCacheEntryPath = finalLocalCacheEntryPath;
      } else {
        terminal.writeWarningLine(
          `"tar" exited with code ${tarExitCode} while attempting to create the cache entry. ` +
            `See "${logFilePath}" for logs from the tar process.`
        );
        return OperationStatus.SuccessWithWarning;
      }
    } else {
      terminal.writeWarningLine(
        `Unable to locate "tar". Please ensure that "tar" is on your PATH environment variable, or set the ` +
          `${EnvironmentVariableNames.RUSH_TAR_BINARY_PATH} environment variable to the full path to the "tar" binary.`
      );
      return OperationStatus.SuccessWithWarning;
    }

    let cacheEntryBuffer: Buffer | undefined;

    let setCloudCacheEntryPromise: Promise<boolean> | undefined;

    // Note that "writeAllowed" settings (whether in config or environment) always apply to
    // the configured CLOUD cache. If the cache is enabled, rush is always allowed to read from and
    // write to the local build cache.

    if (cloudCacheProvider?.isCacheWriteAllowed) {
      if (!cacheEntryBuffer) {
        if (localCacheEntryPath) {
          cacheEntryBuffer = await FileSystem.readFileToBufferAsync(localCacheEntryPath);
        } else {
          throw new InternalError('Expected the local cache entry path to be set.');
        }
      }

      setCloudCacheEntryPromise = cloudCacheProvider?.trySetCacheEntryBufferAsync(
        terminal,
        cacheId,
        cacheEntryBuffer
      );
    }

    const updateCloudCacheSuccess: boolean | undefined = (await setCloudCacheEntryPromise) ?? true;

    const success: boolean = updateCloudCacheSuccess && !!localCacheEntryPath;
    if (success) {
      terminal.writeLine('Successfully set cache entry.');
    } else if (!localCacheEntryPath && updateCloudCacheSuccess) {
      terminal.writeWarningLine('Unable to set local cache entry.');
    } else if (localCacheEntryPath && !updateCloudCacheSuccess) {
      terminal.writeWarningLine('Unable to set cloud cache entry.');
    } else {
      terminal.writeWarningLine('Unable to set both cloud and local cache entries.');
    }

    return success ? status : OperationStatus.SuccessWithWarning;
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

    // Adds child directories to the queue, files to the path list, and bails on symlinks
    function processChildren(relativePath: string, diskPath: string, children: FolderItem[]): void {
      for (const child of children) {
        const childRelativePath: string = `${relativePath}/${child.name}`;
        if (child.isSymbolicLink()) {
          terminal.writeError(
            `Unable to include "${childRelativePath}" in build cache. It is a symbolic link.`
          );
          hasSymbolicLinks = true;
        } else if (child.isDirectory()) {
          queue.push([childRelativePath, `${diskPath}/${child.name}`]);
        } else {
          outputFilePaths.push(childRelativePath);
        }
      }
    }

    // Handle declared output folders.
    for (const outputFolder of this._outputFolderNames) {
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

    return {
      outputFilePaths,
      filteredOutputFolderNames
    };
  }

  private _getTarLogFilePath(): string {
    return path.join(this._project.projectRushTempFolder, `${this._cacheId}.log`);
  }
}
