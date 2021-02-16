// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as events from 'events';
import * as crypto from 'crypto';
import * as path from 'path';
import type * as stream from 'stream';
import * as tar from 'tar';
import * as fs from 'fs';
import { Executable, FileSystem, Path, Terminal } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { RushConstants } from '../RushConstants';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { CloudBuildCacheProviderBase } from './CloudBuildCacheProviderBase';
import { FileSystemBuildCacheProvider } from './FileSystemBuildCacheProvider';
import { ChildProcess } from 'child_process';

interface IProjectBuildCacheOptions {
  buildCacheConfiguration: BuildCacheConfiguration;
  projectConfiguration: RushProjectConfiguration;
  command: string;
  trackedProjectFiles: string[] | undefined;
  packageChangeAnalyzer: PackageChangeAnalyzer;
  terminal: Terminal;
}

export class ProjectBuildCache {
  /**
   * null = we haven't looked yet
   * undefined = not found
   */
  private static __tarExecutablePath: string | undefined | null = null;
  private static get _tarExecutablePath(): string | undefined {
    if (ProjectBuildCache.__tarExecutablePath === null) {
      ProjectBuildCache.__tarExecutablePath = Executable.tryResolve('tar');
    }

    return ProjectBuildCache.__tarExecutablePath;
  }

  private readonly _project: RushConfigurationProject;
  private readonly _localBuildCacheProvider: FileSystemBuildCacheProvider;
  private readonly _cloudBuildCacheProvider: CloudBuildCacheProviderBase | undefined;
  private readonly _projectOutputFolderNames: string[];
  private readonly _cacheId: string | undefined;

  private constructor(options: Omit<IProjectBuildCacheOptions, 'terminal'>) {
    this._project = options.projectConfiguration.project;
    this._localBuildCacheProvider = options.buildCacheConfiguration.localCacheProvider;
    this._cloudBuildCacheProvider = options.buildCacheConfiguration.cloudCacheProvider;
    this._projectOutputFolderNames = options.projectConfiguration.projectOutputFolderNames || [];
    this._cacheId = ProjectBuildCache._getCacheId(options);
  }

  public static tryGetProjectBuildCache(options: IProjectBuildCacheOptions): ProjectBuildCache | undefined {
    const { terminal, projectConfiguration, trackedProjectFiles } = options;
    if (!trackedProjectFiles) {
      return undefined;
    }

    if (!ProjectBuildCache._validateProject(terminal, projectConfiguration, trackedProjectFiles)) {
      return undefined;
    }

    return new ProjectBuildCache(options);
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
        outputFolders.push(`${path.posix.join(normalizedProjectRelativeFolder, outputFolderName)}/`);
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
    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    let localCacheEntryPath:
      | string
      | undefined = await this._localBuildCacheProvider.tryGetCacheEntryPathByIdAsync(terminal, cacheId);
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
          // eslint-disable-next-line require-atomic-updates
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

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    terminal.writeVerboseLine(`Clearing cached folders: ${this._projectOutputFolderNames.join(', ')}`);
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(path.join(projectFolderPath, outputFolderName))
      )
    );

    const tarExecutablePath: string | undefined = ProjectBuildCache._tarExecutablePath;
    let restoreSuccess: boolean;
    if (!tarExecutablePath || !localCacheEntryPath) {
      if (!cacheEntryBuffer && localCacheEntryPath) {
        // eslint-disable-next-line require-atomic-updates
        cacheEntryBuffer = await FileSystem.readFileToBufferAsync(localCacheEntryPath);
      }

      if (!cacheEntryBuffer) {
        throw new Error('Expected the cache entry buffer to be set.');
      }

      // If we don't have tar on the PATH, or if we failed to update the local cache entry,
      // untar in-memory
      const tarStream: stream.Writable = tar.extract({ cwd: projectFolderPath });
      try {
        const tarPromise: Promise<unknown> = events.once(tarStream, 'drain');
        tarStream.write(cacheEntryBuffer);
        await tarPromise;
        restoreSuccess = true;
      } catch (e) {
        restoreSuccess = false;
      }
    } else {
      const childProcess: ChildProcess = Executable.spawn(
        tarExecutablePath,
        ['-x', '-f', localCacheEntryPath],
        {
          currentWorkingDirectory: projectFolderPath
        }
      );
      const [tarExitCode] = await events.once(childProcess, 'exit');
      restoreSuccess = tarExitCode === 0;
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
    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    const projectFolderPath: string = this._project.projectFolder;
    const outputFoldersThatExist: boolean[] = await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName) =>
        FileSystem.existsAsync(path.join(projectFolderPath, outputFolderName))
      )
    );
    const filteredOutputFolders: string[] = [];
    for (let i: number = 0; i < outputFoldersThatExist.length; i++) {
      if (outputFoldersThatExist[i]) {
        filteredOutputFolders.push(this._projectOutputFolderNames[i]);
      }
    }

    terminal.writeVerboseLine(`Caching build output folders: ${filteredOutputFolders.join(', ')}`);
    const tarExecutablePath: string | undefined = ProjectBuildCache._tarExecutablePath;
    let localCacheEntryPath: string | undefined;

    if (tarExecutablePath) {
      const tempLocalCacheEntryPath: string = this._localBuildCacheProvider.getCacheEntryPath(cacheId);
      const childProcess: ChildProcess = Executable.spawn(
        tarExecutablePath,
        ['-c', '-f', tempLocalCacheEntryPath, '-z', ...filteredOutputFolders],
        {
          currentWorkingDirectory: projectFolderPath
        }
      );
      const [tarExitCode] = await events.once(childProcess, 'exit');
      const writeLocalCacheSuccess: boolean = tarExitCode === 0;
      if (writeLocalCacheSuccess) {
        localCacheEntryPath = tempLocalCacheEntryPath;
      }
    }

    let cacheEntryBuffer: Buffer | undefined;
    let setLocalCacheEntryPromise: Promise<string> | undefined;
    if (!localCacheEntryPath) {
      // If we weren't able to create the cache entry with tar, try to do it with the "tar" NPM package
      let encounteredTarErrors: boolean = false;
      const tarStream: stream.Readable = tar.create(
        {
          gzip: true,
          portable: true,
          strict: true,
          cwd: projectFolderPath,
          filter: (tarPath: string, stat: tar.FileStat) => {
            const tempStats: fs.Stats = new fs.Stats();
            tempStats.mode = stat.mode;
            if (tempStats.isSymbolicLink()) {
              terminal.writeError(`Unable to include "${tarPath}" in build cache. It is a symbolic link.`);
              encounteredTarErrors = true;
              return false;
            } else {
              return true;
            }
          }
        },
        filteredOutputFolders
      );
      cacheEntryBuffer = await this._readStreamToBufferAsync(tarStream);
      if (encounteredTarErrors) {
        return false;
      }

      setLocalCacheEntryPromise = this._localBuildCacheProvider.trySetCacheEntryBufferAsync(
        terminal,
        cacheId,
        cacheEntryBuffer
      );
    } else {
      setLocalCacheEntryPromise = Promise.resolve(localCacheEntryPath);
    }

    let setCloudCacheEntryPromise: Promise<boolean> | undefined;
    if (this._cloudBuildCacheProvider?.isCacheWriteAllowed === true) {
      if (!cacheEntryBuffer) {
        if (localCacheEntryPath) {
          cacheEntryBuffer = await FileSystem.readFileToBufferAsync(localCacheEntryPath);
        } else {
          throw new Error('Expected the local cache entry path to be set.');
        }
      }

      setCloudCacheEntryPromise = this._cloudBuildCacheProvider.trySetCacheEntryBufferAsync(
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

  private async _readStreamToBufferAsync(stream: stream.Readable): Promise<Buffer> {
    return await new Promise((resolve: (result: Buffer) => void, reject: (error: Error) => void) => {
      const parts: Uint8Array[] = [];
      stream.on('data', (chunk) => parts.push(chunk));
      stream.on('error', (error) => reject(error));
      stream.on('end', () => {
        const result: Buffer = Buffer.concat(parts);
        resolve(result);
      });
    });
  }

  private static _getCacheId(options: Omit<IProjectBuildCacheOptions, 'terminal'>): string | undefined {
    // The project state hash is calculated in the following method:
    // - The current project's hash (see PackageChangeAnalyzer.getProjectStateHash) is
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
    const packageChangeAnalyzer: PackageChangeAnalyzer = options.packageChangeAnalyzer;
    const projectStates: string[] = [];
    const projectsThatHaveBeenProcessed: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
    let projectsToProcess: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
    projectsToProcess.add(options.projectConfiguration.project);

    while (projectsToProcess.size > 0) {
      const newProjectsToProcess: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
      for (const projectToProcess of projectsToProcess) {
        projectsThatHaveBeenProcessed.add(projectToProcess);

        const projectState: string | undefined = packageChangeAnalyzer.getProjectStateHash(
          projectToProcess.packageName
        );
        if (!projectState) {
          // If we hit any projects with unknown state, return unknown cache ID
          return undefined;
        } else {
          projectStates.push(projectState);
          for (const dependency of projectToProcess.dependencyProjects) {
            if (!projectsThatHaveBeenProcessed.has(dependency)) {
              newProjectsToProcess.add(dependency);
            }
          }
        }
      }

      projectsToProcess = newProjectsToProcess;
    }

    const sortedProjectStates: string[] = projectStates.sort();
    const hash: crypto.Hash = crypto.createHash('sha1');
    const serializedOutputFolders: string = JSON.stringify(
      options.projectConfiguration.projectOutputFolderNames
    );
    hash.update(serializedOutputFolders);
    hash.update(RushConstants.hashDelimiter);
    hash.update(options.command);
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
  }
}
