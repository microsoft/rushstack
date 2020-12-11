// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';
import * as crypto from 'crypto';

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
    terminal: Terminal,
    projectState: IProjectState | undefined
  ): Promise<boolean> {
    if (!projectState) {
      return false;
    }

    const cacheId: string = this._getCacheId(JSON.stringify(projectState));
    const cacheEntryStream: Buffer | undefined = await this._tryGetCacheEntryBufferAsync(terminal, cacheId);
    if (!cacheEntryStream) {
      return false;
    }
  }

  public trySetCacheEntryAsync(
    terminal: Terminal,
    projectState: IProjectState,
    rushProject: RushConfigurationProject
  ): Promise<boolean> {
    const cacheId: string = this._getCacheId(JSON.stringify(projectState));
  }

  protected abstract _tryGetCacheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string
  ): Promise<Buffer | undefined>;
  protected abstract _trySetCAcheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string,
    entryStream: Buffer
  ): Promise<boolean>;

  private _getCacheId(serializedProjectState: string): string {
    let cacheId: string | undefined = BuildCacheProviderBase._cacheIdCache.get(serializedProjectState);
    if (!cacheId) {
      const hash: crypto.Hash = crypto.createHash('sha1');
      hash.update(serializedProjectState);
      cacheId = hash.digest('hex');

      BuildCacheProviderBase._cacheIdCache.set(serializedProjectState, cacheId);
    }

    return cacheId;
  }
}
