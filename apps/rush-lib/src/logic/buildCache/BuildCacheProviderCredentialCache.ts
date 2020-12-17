// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import { RushGlobalFolder } from '../../api/RushGlobalFolder';

const CACHE_FILENAME: string = 'build-cache-credentials-cache.json';

interface IBuildCacheProviderCredentialCacheJson {
  cacheEntries: {
    [credentialCacheId: string]: ICacheEntryJson;
  };
}

interface ICacheEntryJson {
  expiration: number;
  credential: string;
}

export interface ICacheEntry {
  expiration?: Date;
  credential: string;
}

export class BuildCacheProviderCredentialCache {
  private readonly _cacheFilePath: string;
  private readonly _cacheEntries: Map<string, ICacheEntryJson>;
  private _modified: boolean = false;

  private constructor(cacheFilePath: string, loadedJson: IBuildCacheProviderCredentialCacheJson | undefined) {
    this._cacheFilePath = cacheFilePath;
    this._cacheEntries = new Map<string, ICacheEntryJson>(Object.entries(loadedJson?.cacheEntries || {}));
  }

  public static async initializeAsync(
    rushGlobalFolder: RushGlobalFolder
  ): Promise<BuildCacheProviderCredentialCache> {
    const cacheFilePath: string = path.join(rushGlobalFolder.path, CACHE_FILENAME);
    const jsonSchema: JsonSchema = JsonSchema.fromFile(
      path.resolve(__dirname, '..', '..', 'schemas', 'build-cache-credentials-cache.schema.json')
    );
    let loadedJson: IBuildCacheProviderCredentialCacheJson | undefined;
    try {
      loadedJson = await JsonFile.loadAndValidateAsync(cacheFilePath, jsonSchema);
    } catch (e) {
      if (!FileSystem.isErrnoException(e)) {
        throw e;
      }
    }

    const credentialCache: BuildCacheProviderCredentialCache = new BuildCacheProviderCredentialCache(
      cacheFilePath,
      loadedJson
    );
    return credentialCache;
  }

  public setCacheEntry(cacheId: string, credential: string, expiration?: Date): void {
    const expirationMilliseconds: number = expiration?.getTime() || 0;
    const existingCacheEntry: ICacheEntryJson | undefined = this._cacheEntries.get(cacheId);
    if (
      existingCacheEntry?.credential !== credential ||
      existingCacheEntry?.expiration !== expirationMilliseconds
    ) {
      this._modified = true;
      this._cacheEntries.set(cacheId, {
        expiration: expirationMilliseconds,
        credential
      });
    }
  }

  public tryGetCacheEntry(cacheId: string): ICacheEntry | undefined {
    const cacheEntry: ICacheEntryJson | undefined = this._cacheEntries.get(cacheId);
    if (cacheEntry) {
      const result: ICacheEntry = {
        expiration: cacheEntry.expiration ? new Date(cacheEntry.expiration) : undefined,
        credential: cacheEntry.credential
      };

      return result;
    } else {
      return undefined;
    }
  }

  public deleteCacheEntry(cacheId: string): void {
    if (this._cacheEntries.has(cacheId)) {
      this._modified = true;
      this._cacheEntries.delete(cacheId);
    }
  }

  public trimExpiredEntries(): void {
    const now: number = Date.now();
    for (const [cacheId, cacheEntry] of this._cacheEntries.entries()) {
      if (cacheEntry.expiration < now) {
        this._cacheEntries.delete(cacheId);
        this._modified = true;
      }
    }
  }

  public async saveIfModifiedAsync(): Promise<void> {
    if (this._modified) {
      const cacheEntriesJson: { [cacheId: string]: ICacheEntryJson } = {};
      for (const [cacheId, cacheEntry] of this._cacheEntries.entries()) {
        cacheEntriesJson[cacheId] = cacheEntry;
      }

      const newJson: IBuildCacheProviderCredentialCacheJson = {
        cacheEntries: cacheEntriesJson
      };
      await JsonFile.saveAsync(newJson, this._cacheFilePath, {
        ensureFolderExists: true,
        updateExistingFile: true
      });

      this._modified = false;
    }
  }
}
