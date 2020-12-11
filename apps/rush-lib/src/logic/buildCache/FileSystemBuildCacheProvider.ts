// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { RushConfiguration } from '../../api/RushConfiguration';
import { BuildCacheProviderBase, IBuildCacheProviderBaseOptions } from './BuildCacheProviderBase';

export interface IFileSystemBuildCacheProviderOptions extends IBuildCacheProviderBaseOptions {
  rushConfiguration: RushConfiguration;
}

const BUILD_CACHE_FOLDER_NAME: string = 'build-cache';

export class FileSystemBuildCacheProvider extends BuildCacheProviderBase {
  private readonly _cacheFolderPath: string;

  public constructor(options: IFileSystemBuildCacheProviderOptions) {
    super(options);
    this._cacheFolderPath = path.join(options.rushConfiguration.commonTempFolder, BUILD_CACHE_FOLDER_NAME);
  }

  protected async _tryGetCacheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string
  ): Promise<Buffer | undefined> {
    const cacheEntryFilePath: string = path.join(this._cacheFolderPath, cacheId);
    try {
      return await FileSystem.readFileToBufferAsync(cacheEntryFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        return undefined;
      } else {
        throw e;
      }
    }
  }

  protected async _trySetCAcheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<boolean> {
    const cacheEntryFilePath: string = path.join(this._cacheFolderPath, cacheId);
    await FileSystem.writeFileAsync(cacheEntryFilePath, entryBuffer, { ensureFolderExists: true });
    return true;
  }
}
