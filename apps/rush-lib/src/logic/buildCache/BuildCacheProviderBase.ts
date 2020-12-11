// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { CollatedTerminal } from '@rushstack/stream-collator';
import * as crypto from 'crypto';
import * as tar from 'tar';
import type * as stream from 'stream';
import { FileSystem } from '@rushstack/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { IProjectState } from '../taskRunner/ProjectBuilder';

export interface IBuildCacheProviderBaseOptions {
  projectOutputFolderNames: string[];
}

export abstract class BuildCacheProviderBase {
  private static _cacheIdCache: Map<string, string> = new Map<string, string>();

  private readonly _projectOutputFolderNames: string[];

  public constructor(options: IBuildCacheProviderBaseOptions) {
    this._projectOutputFolderNames = options.projectOutputFolderNames;
  }

  public async tryHydrateFromCacheAsync(
    terminal: CollatedTerminal,
    rushProject: RushConfigurationProject,
    projectState: IProjectState | undefined
  ): Promise<boolean> {
    if (!projectState) {
      return false;
    }

    const normalizedProjectRelativeFolder: string = rushProject.projectRelativeFolder.replace(/\\/g, '/');
    if (!this._validateProjectState(terminal, normalizedProjectRelativeFolder, projectState)) {
      return false;
    }

    const cacheId: string = this._getCacheId(JSON.stringify(projectState));
    const cacheEntryBuffer: Buffer | undefined = await this._tryGetCacheEntryBufferAsync(terminal, cacheId);
    if (!cacheEntryBuffer) {
      return false;
    }

    // Purge output folders
    await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName: string) =>
        FileSystem.deleteFolderAsync(path.join(rushProject.projectFolder, outputFolderName))
      )
    );

    const tarStream: stream.Writable = tar.extract({ cwd: rushProject.projectFolder });
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

  public async trySetCacheEntryAsync(
    terminal: CollatedTerminal,
    projectState: IProjectState,
    rushProject: RushConfigurationProject
  ): Promise<boolean> {
    const cacheId: string = this._getCacheId(JSON.stringify(projectState));

    const normalizedProjectRelativeFolder: string = rushProject.projectRelativeFolder.replace(/\\/g, '/');
    if (!this._validateProjectState(terminal, normalizedProjectRelativeFolder, projectState)) {
      return false;
    }

    const outputFoldersThatExist: boolean[] = await Promise.all(
      this._projectOutputFolderNames.map((outputFolderName) =>
        FileSystem.existsAsync(path.join(rushProject.projectFolder, outputFolderName))
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
        cwd: rushProject.projectFolder
      },
      filteredOutputFolders
    );
    const cacheEntryBuffer: Buffer = await this._readStreamToBufferAsync(tarStream);
    return await this._trySetCacheEntryBufferAsync(terminal, cacheId, cacheEntryBuffer);
  }

  protected abstract _tryGetCacheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string
  ): Promise<Buffer | undefined>;
  protected abstract _trySetCacheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<boolean>;

  private _getCacheId(serializedProjectState: string): string {
    // TODO: Include dependencies' states in this calculation
    let cacheId: string | undefined = BuildCacheProviderBase._cacheIdCache.get(serializedProjectState);
    if (!cacheId) {
      const hash: crypto.Hash = crypto.createHash('sha1');
      hash.update(serializedProjectState);
      cacheId = hash.digest('hex');

      BuildCacheProviderBase._cacheIdCache.set(serializedProjectState, cacheId);
    }

    return cacheId;
  }

  private _validateProjectState(
    terminal: CollatedTerminal,
    normalizedProjectRelativeFolder: string,
    projectState: IProjectState
  ): boolean {
    const outputFolders: string[] = [];
    for (const outputFolderName of this._projectOutputFolderNames) {
      outputFolders.push(`${path.posix.join(normalizedProjectRelativeFolder, outputFolderName)}/`);
    }

    const inputOutputFiles: string[] = [];
    for (const file of Object.keys(projectState.files)) {
      for (const outputFolder of outputFolders) {
        if (file.startsWith(outputFolder)) {
          inputOutputFiles.push(file);
        }
      }
    }

    if (inputOutputFiles.length > 0) {
      terminal.writeStderrLine(
        'Unable to use build cache. The following files are used to calculate project state ' +
          `and are considered project output: ${inputOutputFiles.join(', ')}`
      );
      return false;
    } else {
      return true;
    }
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
