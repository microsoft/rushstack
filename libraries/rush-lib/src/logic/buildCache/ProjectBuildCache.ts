// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';

import { FileSystem, type FolderItem, InternalError, Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { RushConstants } from '../RushConstants';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import type { ICloudBuildCacheProvider } from './ICloudBuildCacheProvider';
import type { FileSystemBuildCacheProvider } from './FileSystemBuildCacheProvider';
import { TarExecutable } from '../../utilities/TarExecutable';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';

export interface IProjectBuildCacheOptions {
  buildCacheConfiguration: BuildCacheConfiguration;
  project: RushConfigurationProject;
  projectOutputFolderNames: ReadonlyArray<string>;
  additionalProjectOutputFilePaths?: ReadonlyArray<string>;
  additionalContext?: Record<string, string>;
  configHash: string;
  projectChangeAnalyzer: ProjectChangeAnalyzer;
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
  private readonly _additionalProjectOutputFilePaths: ReadonlyArray<string>;
  private _cacheId: string | undefined;

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
      additionalProjectOutputFilePaths
    } = options;
    this._project = project;
    this._localBuildCacheProvider = localCacheProvider;
    this._cloudBuildCacheProvider = cloudCacheProvider;
    this._buildCacheEnabled = buildCacheEnabled;
    this._cacheWriteEnabled = cacheWriteEnabled;
    this._projectOutputFolderNames = projectOutputFolderNames || [];
    this._additionalProjectOutputFilePaths = additionalProjectOutputFilePaths || [];
    this._cacheId = cacheId;
  }

  private static _tryGetTarUtility(terminal: ITerminal): Promise<TarExecutable | undefined> {
    if (ProjectBuildCache._tarUtilityPromise === null) {
      ProjectBuildCache._tarUtilityPromise = TarExecutable.tryInitializeAsync(terminal);
    }

    return ProjectBuildCache._tarUtilityPromise;
  }

  public get cacheId(): string | undefined {
    return this._cacheId;
  }

  public static async tryGetProjectBuildCache(
    options: IProjectBuildCacheOptions
  ): Promise<ProjectBuildCache | undefined> {
    const cacheId: string | undefined = await ProjectBuildCache._getCacheId(options);
    return new ProjectBuildCache(cacheId, options);
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

    const tarUtility: TarExecutable | undefined = await ProjectBuildCache._tryGetTarUtility(terminal);
    let restoreSuccess: boolean = false;
    if (tarUtility && localCacheEntryPath) {
      const logFilePath: string = this._getTarLogFilePath('untar');
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

    const tarUtility: TarExecutable | undefined = await ProjectBuildCache._tryGetTarUtility(terminal);
    if (tarUtility) {
      const finalLocalCacheEntryPath: string = this._localBuildCacheProvider.getCacheEntryPath(cacheId);

      // Derive the temp file from the destination path to ensure they are on the same volume
      // In the case of a shared network drive containing the build cache, we also need to make
      // sure the the temp path won't be shared by two parallel rush builds.
      const randomSuffix: string = crypto.randomBytes(8).toString('hex');
      const tempLocalCacheEntryPath: string = `${finalLocalCacheEntryPath}-${randomSuffix}.temp`;

      const logFilePath: string = this._getTarLogFilePath('tar');
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

    // Add additional output file paths
    await Async.forEachAsync(
      this._additionalProjectOutputFilePaths,
      async (additionalProjectOutputFilePath: string) => {
        const fullPath: string = `${projectFolderPath}/${additionalProjectOutputFilePath}`;
        const pathExists: boolean = await FileSystem.existsAsync(fullPath);
        if (pathExists) {
          outputFilePaths.push(additionalProjectOutputFilePath);
        }
      },
      { concurrency: 10 }
    );

    // Ensure stable output path order.
    outputFilePaths.sort();

    return {
      outputFilePaths,
      filteredOutputFolderNames
    };
  }

  private _getTarLogFilePath(mode: 'tar' | 'untar'): string {
    return path.join(this._project.projectRushTempFolder, `${this._cacheId}.${mode}.log`);
  }

  private static async _getCacheId({
    projectChangeAnalyzer,
    project,
    terminal,
    projectOutputFolderNames,
    configHash,
    additionalContext,
    phaseName,
    buildCacheConfiguration: { getCacheEntryId }
  }: IProjectBuildCacheOptions): Promise<string | undefined> {
    // The project state hash is calculated in the following method:
    // - The current project's hash (see ProjectChangeAnalyzer.getProjectStateHash) is
    //   calculated and appended to an array
    // - The current project's recursive dependency projects' hashes are calculated
    //   and appended to the array
    // - A SHA1 hash is created and the following data is fed into it, in order:
    //   1. The JSON-serialized list of output folder names for this
    //      project (see ProjectBuildCache._projectOutputFolderNames)
    //   2. The configHash from the operation's runner
    //   3. Each dependency project hash (from the array constructed in previous steps),
    //      in sorted alphanumerical-sorted order
    // - A hex digest of the hash is returned
    const projectStates: string[] = [];
    const projectsToProcess: Set<RushConfigurationProject> = new Set();
    projectsToProcess.add(project);

    for (const projectToProcess of projectsToProcess) {
      const projectState: string | undefined = await projectChangeAnalyzer._tryGetProjectStateHashAsync(
        projectToProcess,
        terminal
      );
      if (!projectState) {
        // If we hit any projects with unknown state, return unknown cache ID
        return undefined;
      } else {
        projectStates.push(projectState);
        for (const dependency of projectToProcess.dependencyProjects) {
          projectsToProcess.add(dependency);
        }
      }
    }

    const sortedProjectStates: string[] = projectStates.sort();
    const hash: crypto.Hash = crypto.createHash('sha1');
    // This value is used to force cache bust when the build cache algorithm changes
    hash.update(`${RushConstants.buildCacheVersion}`);
    hash.update(RushConstants.hashDelimiter);
    const serializedOutputFolders: string = JSON.stringify(projectOutputFolderNames);
    hash.update(serializedOutputFolders);
    hash.update(RushConstants.hashDelimiter);
    hash.update(configHash);
    hash.update(RushConstants.hashDelimiter);
    if (additionalContext) {
      for (const key of Object.keys(additionalContext).sort()) {
        // Add additional context keys and values.
        //
        // This choice (to modify the hash for every key regardless of whether a value is set) implies
        // that just _adding_ an env var to the list of dependsOnEnvVars will modify its hash. This
        // seems appropriate, because this behavior is consistent whether or not the env var happens
        // to have a value.
        hash.update(`${key}=${additionalContext[key]}`);
        hash.update(RushConstants.hashDelimiter);
      }
    }
    for (const projectHash of sortedProjectStates) {
      hash.update(projectHash);
      hash.update(RushConstants.hashDelimiter);
    }

    const projectStateHash: string = hash.digest('hex');

    return getCacheEntryId({
      projectName: project.packageName,
      projectStateHash,
      phaseName
    });
  }
}
