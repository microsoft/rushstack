// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import * as path from 'path';
import type * as stream from 'stream';
import * as tar from 'tar';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { FileSystem } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { BuildCacheProviderBase } from './BuildCacheProviderBase';
import { ProjectBuildCacheConfiguration } from '../../api/ProjectBuildCacheConfiguration';

export interface IProjectBuildCacheOptions {
  projectBuildCacheConfiguration: ProjectBuildCacheConfiguration;
  command: string;
  buildCacheProvider: BuildCacheProviderBase;
  packageChangeAnalyzer: PackageChangeAnalyzer;
}

export class ProjectBuildCache {
  private readonly _project: RushConfigurationProject;
  private readonly _command: string;
  private readonly _buildCacheProvider: BuildCacheProviderBase;
  private readonly _packageChangeAnalyzer: PackageChangeAnalyzer;
  private readonly _projectOutputFolderNames: string[];

  // If __cacheId is null, one doesn't exist
  private __cacheId: string | undefined | null;
  private get _cacheId(): string | undefined {
    if (this.__cacheId === null) {
      return undefined;
    } else if (!this.__cacheId) {
      const projectStates: string[] = [];
      const projectsThatHaveBeenProcessed: Set<RushConfigurationProject> = new Set<
        RushConfigurationProject
      >();
      const projectsToProcess: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
      projectsToProcess.add(this._project);

      while (projectsToProcess.size > 0) {
        for (const projectToProcess of projectsToProcess) {
          projectsThatHaveBeenProcessed.add(projectToProcess);
          projectsToProcess.delete(projectToProcess);

          const projectState: string | undefined = this._packageChangeAnalyzer.getProjectStateHash(
            projectToProcess.packageName
          );
          if (!projectState) {
            // If we hit any projects with unknown state, return unknown cache ID
            this.__cacheId = null;
            return undefined;
          } else {
            projectStates.push(projectState);
            for (const dependency of projectToProcess.localDependencyProjects) {
              if (!projectsThatHaveBeenProcessed.has(dependency)) {
                projectsToProcess.add(dependency);
              }
            }
          }
        }
      }

      const sortedProjectStates: string[] = projectStates.sort();
      const hash: crypto.Hash = crypto.createHash('sha1');
      hash.update(this._command);
      for (const projectHash of sortedProjectStates) {
        hash.update(projectHash);
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
  }

  public async tryHydrateFromCacheAsync(terminal: CollatedTerminal): Promise<boolean> {
    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
      return false;
    }

    const cacheEntryBuffer:
      | Buffer
      | undefined = await this._buildCacheProvider.tryGetCacheEntryBufferByIdAsync(terminal, cacheId);
    if (!cacheEntryBuffer) {
      return false;
    }

    const projectFolderPath: string = this._project.projectFolder;

    // Purge output folders
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(path.join(projectFolderPath, outputFolderName))
      )
    );

    const tarStream: stream.Writable = tar.extract({ cwd: projectFolderPath });
    return await new Promise((resolve: (result: boolean) => void, reject: (error: Error) => void) => {
      try {
        tarStream.on('error', (error: Error) => reject(error));
        tarStream.on('close', () => resolve(true));
        tarStream.on('drain', () => resolve(true));
        tarStream.write(cacheEntryBuffer);
      } catch (e) {
        reject(e);
      }
    });
  }

  public async trySetCacheEntryAsync(terminal: CollatedTerminal): Promise<boolean> {
    const cacheId: string | undefined = this._cacheId;
    if (!cacheId) {
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

    const tarStream: stream.Readable = tar.create(
      {
        gzip: true,
        portable: true,
        cwd: projectFolderPath
      },
      filteredOutputFolders
    );
    const cacheEntryBuffer: Buffer = await this._readStreamToBufferAsync(tarStream);
    return await this._buildCacheProvider.trySetCacheEntryBufferAsync(terminal, cacheId, cacheEntryBuffer);
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
