// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import events from 'events';
import * as crypto from 'crypto';
import type * as stream from 'stream';
import * as tar from 'tar';
import { FileSystem, Path, ITerminal, FolderItem } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { RushConstants } from '../RushConstants';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { ICloudBuildCacheProvider } from './ICloudBuildCacheProvider';
import { FileSystemBuildCacheProvider } from './FileSystemBuildCacheProvider';
import { TarExecutable } from '../../utilities/TarExecutable';
import { Utilities } from '../../utilities/Utilities';

export interface IProjectBuildCacheOptions {
  buildCacheConfiguration: BuildCacheConfiguration;
  projectConfiguration: RushProjectConfiguration;
  projectOutputFolderNames: ReadonlyArray<string>;
  command: string;
  trackedProjectFiles: Iterable<string> | undefined;
  hash: string;
  terminal: ITerminal;
  phaseName: string;
}

interface IPathsToCache {
  filteredOutputFolderNames: string[];
  outputFilePaths: string[];
}

export class ProjectBuildCache {
  /**
   * null === we haven't tried to initialize yet
   * undefined === unable to initialize
   */
  private static _tarUtilityPromise: Promise<TarExecutable | undefined> | null = null;

  private readonly _project: RushConfigurationProject;
  private readonly _localBuildCacheProvider: FileSystemBuildCacheProvider;
  private readonly _cloudBuildCacheProvider: ICloudBuildCacheProvider | undefined;
  private readonly _buildCacheEnabled: boolean;
  private readonly _cacheWriteEnabled: boolean;
  private readonly _projectOutputFolderNames: ReadonlyArray<string>;
  private _cacheId: string | undefined;

  private constructor(cacheId: string | undefined, options: IProjectBuildCacheOptions) {
    const { buildCacheConfiguration, projectConfiguration, projectOutputFolderNames } = options;
    this._project = projectConfiguration.project;
    this._localBuildCacheProvider = buildCacheConfiguration.localCacheProvider;
    this._cloudBuildCacheProvider = buildCacheConfiguration.cloudCacheProvider;
    this._buildCacheEnabled = buildCacheConfiguration.buildCacheEnabled;
    this._cacheWriteEnabled = buildCacheConfiguration.cacheWriteEnabled;
    this._projectOutputFolderNames = projectOutputFolderNames || [];
    this._cacheId = cacheId;
  }

  private static _tryGetTarUtility(terminal: ITerminal): Promise<TarExecutable | undefined> {
    if (ProjectBuildCache._tarUtilityPromise === null) {
      ProjectBuildCache._tarUtilityPromise = TarExecutable.tryInitializeAsync(terminal);
    }

    return ProjectBuildCache._tarUtilityPromise;
  }

  public static async tryGetProjectBuildCache(
    options: IProjectBuildCacheOptions
  ): Promise<ProjectBuildCache | undefined> {
    const { terminal, projectConfiguration, projectOutputFolderNames, trackedProjectFiles, hash } = options;
    if (!trackedProjectFiles || !hash) {
      return undefined;
    }

    if (
      !ProjectBuildCache._validateProject(
        terminal,
        projectConfiguration,
        projectOutputFolderNames,
        trackedProjectFiles
      )
    ) {
      return undefined;
    }

    const cacheId: string | undefined = await ProjectBuildCache._getCacheId(options);
    return new ProjectBuildCache(cacheId, options);
  }

  private static _validateProject(
    terminal: ITerminal,
    projectConfiguration: RushProjectConfiguration,
    projectOutputFolderNames: ReadonlyArray<string>,
    trackedProjectFiles: Iterable<string>
  ): boolean {
    const normalizedProjectRelativeFolder: string = Path.convertToSlashes(
      projectConfiguration.project.projectRelativeFolder
    );
    const outputFolders: string[] = [];
    if (projectOutputFolderNames) {
      for (const outputFolderName of projectOutputFolderNames) {
        outputFolders.push(`${normalizedProjectRelativeFolder}/${outputFolderName}/`);
      }
    }

    const inputOutputFiles: string[] = [];
    for (const file of trackedProjectFiles) {
      for (const outputFolder of outputFolders) {
        if (file.startsWith(outputFolder)) {
          inputOutputFiles.push(file);
        }
      }
    }

    if (inputOutputFiles.length > 0) {
      terminal.writeWarningLine(
        'Unable to use build cache. The following files are used to calculate project state ' +
          `and are considered project output: ${inputOutputFiles.join(', ')}`
      );
      return false;
    } else {
      return true;
    }
  }

  public async tryRestoreFromCacheAsync(terminal: ITerminal): Promise<boolean> {
    const cacheId: string | undefined = this._cacheId;
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
    terminal.writeVerboseLine(cacheId);

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    terminal.writeVerboseLine(`Clearing cached folders: ${this._projectOutputFolderNames.join(', ')}`);
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(`${projectFolderPath}/${outputFolderName}`)
      )
    );

    const tarUtility: TarExecutable | undefined = await ProjectBuildCache._tryGetTarUtility(terminal);
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
      } else {
        terminal.writeWarningLine(
          `"tar" exited with code ${tarExitCode} while attempting to restore cache entry. ` +
            'Rush will attempt to extract from the cache entry with a JavaScript implementation of tar. ' +
            `See "${logFilePath}" for logs from the tar process.`
        );
      }
    }

    if (!restoreSuccess) {
      if (!cacheEntryBuffer && localCacheEntryPath) {
        cacheEntryBuffer = await FileSystem.readFileToBufferAsync(localCacheEntryPath);
      }

      if (!cacheEntryBuffer) {
        throw new Error('Expected the cache entry buffer to be set.');
      }

      // If we don't have tar on the PATH, if we failed to update the local cache entry,
      // or if the tar binary failed, untar in-memory
      const tarStream: stream.Writable = tar.extract({
        cwd: projectFolderPath,
        // Set to true to omit writing mtime value for extracted entries.
        m: true
      });
      try {
        const tarPromise: Promise<unknown> = events.once(tarStream, 'drain');
        tarStream.write(cacheEntryBuffer);
        await tarPromise;
        restoreSuccess = true;
      } catch (e) {
        restoreSuccess = false;
      }
    }

    if (restoreSuccess) {
      terminal.writeLine('Successfully restored output from the build cache.');
    } else {
      terminal.writeWarningLine('Unable to restore output from the build cache.');
    }

    if (updateLocalCacheSuccess === false) {
      terminal.writeWarningLine('Unable to update the local build cache with data from the cloud cache.');
    }

    return restoreSuccess;
  }

  public async trySetCacheEntryAsync(terminal: ITerminal): Promise<boolean> {
    if (!this._cacheWriteEnabled) {
      // Skip writing local and cloud build caches, without any noise
      return true;
    }

    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    const projectFolderPath: string = this._project.projectFolder;
    const filesToCache: IPathsToCache | undefined = await this._tryCollectPathsToCacheAsync(terminal);
    if (!filesToCache) {
      return false;
    }

    terminal.writeVerboseLine(
      `Caching build output folders: ${filesToCache.filteredOutputFolderNames.join(', ')}`
    );

    let localCacheEntryPath: string | undefined;

    const tarUtility: TarExecutable | undefined = await ProjectBuildCache._tryGetTarUtility(terminal);
    if (tarUtility) {
      const finalLocalCacheEntryPath: string = this._localBuildCacheProvider.getCacheEntryPath(cacheId);
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
            'Rush will attempt to create the cache entry with a JavaScript implementation of tar. ' +
            `See "${logFilePath}" for logs from the tar process.`
        );
      }
    }

    let cacheEntryBuffer: Buffer | undefined;
    let setLocalCacheEntryPromise: Promise<string> | undefined;
    if (!localCacheEntryPath) {
      // If we weren't able to create the cache entry with tar, try to do it with the "tar" NPM package
      const tarStream: stream.Readable = tar.create(
        {
          gzip: true,
          portable: true,
          strict: true,
          cwd: projectFolderPath
        },
        filesToCache.outputFilePaths
      );
      cacheEntryBuffer = await Utilities.readStreamToBufferAsync(tarStream);
      setLocalCacheEntryPromise = this._localBuildCacheProvider.trySetCacheEntryBufferAsync(
        terminal,
        cacheId,
        cacheEntryBuffer
      );
    } else {
      setLocalCacheEntryPromise = Promise.resolve(localCacheEntryPath);
    }

    let setCloudCacheEntryPromise: Promise<boolean> | undefined;

    // Note that "writeAllowed" settings (whether in config or environment) always apply to
    // the configured CLOUD cache. If the cache is enabled, rush is always allowed to read from and
    // write to the local build cache.

    if (this._cloudBuildCacheProvider?.isCacheWriteAllowed) {
      if (!cacheEntryBuffer) {
        if (localCacheEntryPath) {
          cacheEntryBuffer = await FileSystem.readFileToBufferAsync(localCacheEntryPath);
        } else {
          throw new Error('Expected the local cache entry path to be set.');
        }
      }

      setCloudCacheEntryPromise = this._cloudBuildCacheProvider?.trySetCacheEntryBufferAsync(
        terminal,
        cacheId,
        cacheEntryBuffer
      );
    }

    let localCachePath: string;
    let updateCloudCacheSuccess: boolean;
    if (setCloudCacheEntryPromise) {
      [updateCloudCacheSuccess, localCachePath] = await Promise.all([
        setCloudCacheEntryPromise,
        setLocalCacheEntryPromise
      ]);
    } else {
      updateCloudCacheSuccess = true;
      localCachePath = await setLocalCacheEntryPromise;
    }

    const success: boolean = updateCloudCacheSuccess && !!localCachePath;
    if (success) {
      terminal.writeLine('Successfully set cache entry.');
    } else if (!localCachePath && updateCloudCacheSuccess) {
      terminal.writeWarningLine('Unable to set local cache entry.');
    } else if (localCachePath && !updateCloudCacheSuccess) {
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

  private _getTarLogFilePath(): string {
    return path.join(this._project.projectRushTempFolder, `${this._cacheId}.log`);
  }

  private static async _getCacheId(options: IProjectBuildCacheOptions): Promise<string | undefined> {
    // The project state hash is calculated in the following method:
    // - A SHA1 hash is created and the following data is fed into it, in order:
    //   1. The JSON-serialized list of output folder names for this
    //      project (see ProjectBuildCache._projectOutputFolderNames)
    //   2. The command that will be run in the project
    //   3. The hash of the projet inputs
    // - A hex digest of the hash is returned
    const hash: crypto.Hash = crypto.createHash('sha1');
    // This value is used to force cache bust when the build cache algorithm changes
    hash.update(`${RushConstants.buildCacheVersion}`);
    hash.update(RushConstants.hashDelimiter);
    const serializedOutputFolders: string = JSON.stringify(options.projectOutputFolderNames);
    hash.update(serializedOutputFolders);
    hash.update(RushConstants.hashDelimiter);
    hash.update(options.command);
    hash.update(RushConstants.hashDelimiter);
    hash.update(options.hash);
    hash.update(RushConstants.hashDelimiter);

    const projectStateHash: string = hash.digest('hex');

    return options.buildCacheConfiguration.getCacheEntryId({
      projectName: options.projectConfiguration.project.packageName,
      projectStateHash,
      phaseName: options.phaseName
    });
  }
}
