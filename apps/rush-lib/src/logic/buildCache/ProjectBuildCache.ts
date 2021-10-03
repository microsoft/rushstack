// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import events from 'events';
import * as crypto from 'crypto';
import type * as stream from 'stream';
import * as tar from 'tar';
import { FileSystem, LegacyAdapters, Path, Terminal } from '@rushstack/node-core-library';
import * as fs from 'fs';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { RushConstants } from '../RushConstants';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { CloudBuildCacheProviderBase } from './CloudBuildCacheProviderBase';
import { FileSystemBuildCacheProvider } from './FileSystemBuildCacheProvider';
import { TarExecutable } from '../../utilities/TarExecutable';
import { Utilities } from '../../utilities/Utilities';

interface IProjectBuildCacheOptions {
  buildCacheConfiguration: BuildCacheConfiguration;
  projectConfiguration: RushProjectConfiguration;
  cacheKeys: ReadonlyArray<string>;
  trackedProjectFiles: string[] | undefined;
  projectChangeAnalyzer: ProjectChangeAnalyzer;
  terminal: Terminal;
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
  private static _tarUtility: TarExecutable | null | undefined = null;

  private readonly _project: RushConfigurationProject;
  private readonly _localBuildCacheProvider: FileSystemBuildCacheProvider;
  private readonly _cloudBuildCacheProvider: CloudBuildCacheProviderBase | undefined;
  private readonly _buildCacheEnabled: boolean;
  private readonly _projectOutputFolderNames: string[];
  private readonly _cacheIds: ReadonlyArray<string> | undefined;

  private constructor(cacheIds: ReadonlyArray<string> | undefined, options: IProjectBuildCacheOptions) {
    this._project = options.projectConfiguration.project;
    this._localBuildCacheProvider = options.buildCacheConfiguration.localCacheProvider;
    this._cloudBuildCacheProvider = options.buildCacheConfiguration.cloudCacheProvider;
    this._buildCacheEnabled = options.buildCacheConfiguration.buildCacheEnabled;
    this._projectOutputFolderNames = options.projectConfiguration.projectOutputFolderNames || [];
    this._cacheIds = cacheIds;
  }

  private static _tryGetTarUtility(terminal: Terminal): TarExecutable | undefined {
    if (ProjectBuildCache._tarUtility === null) {
      ProjectBuildCache._tarUtility = TarExecutable.tryInitialize(terminal);
    }

    return ProjectBuildCache._tarUtility;
  }

  public static async tryGetProjectBuildCache(
    options: IProjectBuildCacheOptions
  ): Promise<ProjectBuildCache | undefined> {
    const { terminal, projectConfiguration, trackedProjectFiles } = options;
    if (!trackedProjectFiles) {
      return undefined;
    }

    if (!ProjectBuildCache._validateProject(terminal, projectConfiguration, trackedProjectFiles)) {
      return undefined;
    }

    const cacheIds: ReadonlyArray<string> | undefined = await ProjectBuildCache._getCacheIds(options);
    return new ProjectBuildCache(cacheIds, options);
  }

  private static _validateProject(
    terminal: Terminal,
    projectConfiguration: RushProjectConfiguration,
    trackedProjectFiles: string[]
  ): boolean {
    const normalizedProjectRelativeFolder: string = Path.convertToSlashes(
      projectConfiguration.project.projectRelativeFolder
    );
    const outputFolders: string[] = [];
    if (projectConfiguration.projectOutputFolderNames) {
      for (const outputFolderName of projectConfiguration.projectOutputFolderNames) {
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

  public async tryRestoreFromCacheAsync(terminal: Terminal): Promise<boolean> {
    const cacheIds: ReadonlyArray<string> | undefined = this._cacheIds;
    if (!cacheIds) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    if (!this._buildCacheEnabled) {
      // Skip reading local and cloud build caches, without any noise
      return false;
    }

    let localCacheEntryPath: string | undefined;
    for (const cacheId of cacheIds) {
      localCacheEntryPath = await this._localBuildCacheProvider.tryGetCacheEntryPathByIdAsync(
        terminal,
        cacheId
      );
      if (localCacheEntryPath) {
        break;
      }
    }

    let cacheEntryBuffer: Buffer | undefined;
    let updateLocalCacheSuccess: boolean | undefined;
    if (!localCacheEntryPath && this._cloudBuildCacheProvider) {
      terminal.writeVerboseLine(
        'This project was not found in the local build cache. Querying the cloud build cache.'
      );

      for (const cacheId of cacheIds) {
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
    }

    if (!localCacheEntryPath && !cacheEntryBuffer) {
      terminal.writeVerboseLine('This project was not found in the build cache.');
      return false;
    }

    terminal.writeLine('Build cache hit.');

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    terminal.writeVerboseLine(`Clearing cached folders: ${this._projectOutputFolderNames.join(', ')}`);
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(`${projectFolderPath}/${outputFolderName}`)
      )
    );

    const tarUtility: TarExecutable | undefined = ProjectBuildCache._tryGetTarUtility(terminal);
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

  public async trySetCacheEntryAsync(terminal: Terminal): Promise<boolean> {
    // Use the first id in the list, as it is the exact match. Later entries are fallbacks.
    const cacheId: string | undefined = this._cacheIds?.[0];
    if (!cacheId) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    if (!this._buildCacheEnabled) {
      // Skip writing local and cloud build caches, without any noise
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

    const tarUtility: TarExecutable | undefined = ProjectBuildCache._tryGetTarUtility(terminal);
    if (tarUtility) {
      const tempLocalCacheEntryPath: string = this._localBuildCacheProvider.getCacheEntryPath(cacheId);
      const logFilePath: string = this._getTarLogFilePath();
      const tarExitCode: number = await tarUtility.tryCreateArchiveFromProjectPathsAsync({
        archivePath: tempLocalCacheEntryPath,
        paths: filesToCache.outputFilePaths,
        project: this._project,
        logFilePath
      });
      if (tarExitCode === 0) {
        localCacheEntryPath = tempLocalCacheEntryPath;
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

  private async _tryCollectPathsToCacheAsync(terminal: Terminal): Promise<IPathsToCache | undefined> {
    const projectFolderPath: string = this._project.projectFolder;
    const outputFolderNamesThatExist: boolean[] = await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName) =>
        FileSystem.existsAsync(`${projectFolderPath}/${outputFolderName}`)
      )
    );
    const filteredOutputFolderNames: string[] = [];
    for (let i: number = 0; i < outputFolderNamesThatExist.length; i++) {
      if (outputFolderNamesThatExist[i]) {
        filteredOutputFolderNames.push(this._projectOutputFolderNames[i]);
      }
    }

    let encounteredEnumerationIssue: boolean = false;
    function symbolicLinkPathCallback(entryPath: string): void {
      terminal.writeError(`Unable to include "${entryPath}" in build cache. It is a symbolic link.`);
      encounteredEnumerationIssue = true;
    }

    const outputFilePaths: string[] = [];
    for (const filteredOutputFolderName of filteredOutputFolderNames) {
      if (encounteredEnumerationIssue) {
        return undefined;
      }

      const outputFilePathsForFolder: AsyncIterableIterator<string> = this._getPathsInFolder(
        terminal,
        symbolicLinkPathCallback,
        filteredOutputFolderName,
        `${projectFolderPath}/${filteredOutputFolderName}`
      );

      for await (const outputFilePath of outputFilePathsForFolder) {
        outputFilePaths.push(outputFilePath);
      }
    }

    if (encounteredEnumerationIssue) {
      return undefined;
    }

    return {
      filteredOutputFolderNames,
      outputFilePaths
    };
  }

  private async *_getPathsInFolder(
    terminal: Terminal,
    symbolicLinkPathCallback: (path: string) => void,
    posixPrefix: string,
    folderPath: string
  ): AsyncIterableIterator<string> {
    const folderEntries: fs.Dirent[] = await LegacyAdapters.convertCallbackToPromise(fs.readdir, folderPath, {
      withFileTypes: true
    });
    for (const folderEntry of folderEntries) {
      const entryPath: string = `${posixPrefix}/${folderEntry.name}`;
      if (folderEntry.isSymbolicLink()) {
        symbolicLinkPathCallback(entryPath);
      } else if (folderEntry.isDirectory()) {
        yield* this._getPathsInFolder(
          terminal,
          symbolicLinkPathCallback,
          entryPath,
          `${folderPath}/${folderEntry.name}`
        );
      } else {
        yield entryPath;
      }
    }
  }

  private _getTarLogFilePath(): string {
    return path.join(this._project.projectRushTempFolder, 'build-cache-tar.log');
  }

  private static async _getCacheIds(options: IProjectBuildCacheOptions): Promise<string[] | undefined> {
    // The project state hash is calculated in the following method:
    // - The current project's hash (see ProjectChangeAnalyzer.getProjectStateHash) is
    //   calculated and appended to an array
    // - The current project's recursive dependency projects' hashes are calculated
    //   and appended to the array
    // - A SHA1 hash is created and the following data is fed into it, in order:
    //   1. The JSON-serialized list of output folder names for this
    //      project (see ProjectBuildCache._projectOutputFolderNames)
    //   2. The command that will be run in the project
    //   3. Each dependency project hash (from the array constructed in previous steps),
    //      in sorted alphanumerical-sorted order
    // - A hex digest of the hash is returned
    const projectChangeAnalyzer: ProjectChangeAnalyzer = options.projectChangeAnalyzer;
    const projectStates: string[] = [];

    const projectQueue: Set<RushConfigurationProject> = new Set<RushConfigurationProject>([
      options.projectConfiguration.project
    ]);

    for (const project of projectQueue) {
      const projectState: string | undefined = await projectChangeAnalyzer._tryGetProjectStateHashAsync(
        project.packageName,
        options.terminal
      );
      if (!projectState) {
        // If we hit any projects with unknown state, return unknown cache ID
        return undefined;
      } else {
        projectStates.push(projectState);
        for (const dependency of project.dependencyProjects) {
          projectQueue.add(dependency);
        }
      }
    }

    const sortedProjectStates: string[] = projectStates.sort();
    const serializedOutputFolders: string = JSON.stringify(
      options.projectConfiguration.projectOutputFolderNames
    );

    // Ensure there are no duplicates in the cache keys
    const cacheKeySet: Set<string> = new Set(options.cacheKeys);

    return Array.from(cacheKeySet, (key: string) => {
      const hash: crypto.Hash = crypto.createHash('sha1');
      hash.update(serializedOutputFolders);
      hash.update(RushConstants.hashDelimiter);

      // When updating to node 12 typings, move "command" to the end and use hash.copy() to avoid duplicate work
      hash.update(key);
      hash.update(RushConstants.hashDelimiter);
      for (const projectHash of sortedProjectStates) {
        hash.update(projectHash);
        hash.update(RushConstants.hashDelimiter);
      }

      const projectStateHash: string = hash.digest('hex');

      return options.buildCacheConfiguration.getCacheEntryId({
        projectName: options.projectConfiguration.project.packageName,
        projectStateHash
      });
    });
  }
}
