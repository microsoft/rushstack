// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import * as path from 'path';
import type * as stream from 'stream';
import * as tar from 'tar';
import { FileSystem, Terminal } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { BuildCacheProviderBase } from './BuildCacheProviderBase';
import { ProjectBuildCacheConfiguration } from '../../api/ProjectBuildCacheConfiguration';
import { RushConstants } from '../RushConstants';

export interface IProjectBuildCacheOptions {
  projectBuildCacheConfiguration: ProjectBuildCacheConfiguration;
  command: string;
  buildCacheProvider: BuildCacheProviderBase;
  packageChangeAnalyzer: PackageChangeAnalyzer;
  terminal: Terminal;
}

export class ProjectBuildCache {
  private readonly _project: RushConfigurationProject;
  private readonly _command: string;
  private readonly _buildCacheProvider: BuildCacheProviderBase;
  private readonly _packageChangeAnalyzer: PackageChangeAnalyzer;
  private readonly _projectOutputFolderNames: string[];
  private readonly _terminal: Terminal;

  // If __cacheId is null, one doesn't exist
  private __cacheIdCannotBeCalculated: boolean | undefined;
  private __cacheId: string | undefined;
  /**
   * The cache ID is calculated in the following method:
   * - The current project's hash (see PackageChangeAnalyzer.getProjectStateHash) is
   *   calculated and appended to an array
   * - The current project's recursive dependency projects' hashes are calculated
   *   and appended to the array
   * - A SHA1 hash is created and the following data is fed into it, in order:
   *   1. The JSON-serialized list of output folder names for this
   *      project (see ProjectBuildCache._projectOutputFolderNames)
   *   2. The command that will be run in the project
   *   3. Each dependency project hash (from the array constructed in previous steps),
   *      in sorted alphanumerical-sorted order
   * - A hex digest of the hash is returned
   */
  private get _cacheId(): string | undefined {
    if (this.__cacheIdCannotBeCalculated) {
      return undefined;
    } else if (!this.__cacheId) {
      const projectStates: string[] = [];
      const projectsThatHaveBeenProcessed: Set<RushConfigurationProject> = new Set<
        RushConfigurationProject
      >();
      let projectsToProcess: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
      projectsToProcess.add(this._project);

      while (projectsToProcess.size > 0) {
        const newProjectsToProcess: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
        for (const projectToProcess of projectsToProcess) {
          projectsThatHaveBeenProcessed.add(projectToProcess);

          const projectState: string | undefined = this._packageChangeAnalyzer.getProjectStateHash(
            projectToProcess.packageName
          );
          if (!projectState) {
            // If we hit any projects with unknown state, return unknown cache ID
            this.__cacheIdCannotBeCalculated = true;
            return undefined;
          } else {
            projectStates.push(projectState);
            for (const dependency of projectToProcess.localDependencyProjects) {
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
      const serializedOutputFolders: string = JSON.stringify(this._projectOutputFolderNames);
      hash.update(serializedOutputFolders);
      hash.update(RushConstants.hashDelimiter);
      hash.update(this._command);
      hash.update(RushConstants.hashDelimiter);
      for (const projectHash of sortedProjectStates) {
        hash.update(projectHash);
        hash.update(RushConstants.hashDelimiter);
      }

      this.__cacheId = hash.digest('hex');
    }

    return this.__cacheId;
  }

  public constructor(options: IProjectBuildCacheOptions) {
    this._project = options.projectBuildCacheConfiguration.project;
    this._command = options.command;
    this._buildCacheProvider = options.buildCacheProvider;
    this._packageChangeAnalyzer = options.packageChangeAnalyzer;
    this._projectOutputFolderNames = options.projectBuildCacheConfiguration.projectOutputFolders;
    this._terminal = options.terminal;
  }

  public async tryRestoreFromCacheAsync(): Promise<boolean> {
    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      this._terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
      return false;
    }

    const cacheEntryBuffer:
      | Buffer
      | undefined = await this._buildCacheProvider.tryGetCacheEntryBufferByIdAsync(this._terminal, cacheId);
    if (!cacheEntryBuffer) {
      this._terminal.writeVerboseLine('This project was not found in the build cache.');
      return false;
    }

    this._terminal.writeLine('Build cache hit.');

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    this._terminal.writeVerboseLine(`Clearing cached folders: ${this._projectOutputFolderNames.join(', ')}`);
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(path.join(projectFolderPath, outputFolderName))
      )
    );

    const tarStream: stream.Writable = tar.extract({ cwd: projectFolderPath });
    const success: boolean = await new Promise(
      (resolve: (result: boolean) => void, reject: (error: Error) => void) => {
        try {
          tarStream.on('error', (error: Error) => reject(error));
          tarStream.on('close', () => resolve(true));
          tarStream.on('drain', () => resolve(true));
          tarStream.write(cacheEntryBuffer);
        } catch (e) {
          reject(e);
        }
      }
    );

    if (success) {
      this._terminal.writeLine('Successfully restored build output from cache.');
    } else {
      this._terminal.writeWarningLine('Unable to restore build output from cache.');
    }

    return success;
  }

  public async trySetCacheEntryAsync(): Promise<boolean> {
    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      this._terminal.writeWarningLine('Unable to get cache ID. Ensure Git is installed.');
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

    this._terminal.writeVerboseLine(`Caching build output folders: ${filteredOutputFolders.join(', ')}`);
    const tarStream: stream.Readable = tar.create(
      {
        gzip: true,
        portable: true,
        cwd: projectFolderPath
      },
      filteredOutputFolders
    );
    const cacheEntryBuffer: Buffer = await this._readStreamToBufferAsync(tarStream);
    const success: boolean = await this._buildCacheProvider.trySetCacheEntryBufferAsync(
      this._terminal,
      cacheId,
      cacheEntryBuffer
    );

    if (success) {
      this._terminal.writeLine('Successfully set cache entry.');
    } else {
      this._terminal.writeWarningLine('Unable to set cache entry.');
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
}
