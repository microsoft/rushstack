// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, JsonFile, JsonSchema, LockFile } from '@rushstack/node-core-library';

import { RushGlobalFolder } from '../../api/RushGlobalFolder';

const CACHE_FILENAME: string = 'build-cache-credentials-cache.json';

interface IBuildCacheProviderCredentialCacheJson {
  cacheEntries: {
    [credentialCacheId: string]: ICacheEntryJson;
  };
}

interface ICacheEntryJson {
  expires: number;
  credential: string;
}

export interface IBuildCacheProviderCredentialCacheEntry {
  expires?: Date;
  credential: string;
}

export class BuildCacheProviderCredentialCache {
  private readonly _cacheFilePath: string;
  private readonly _cacheEntries: Map<string, ICacheEntryJson>;
  private _modified: boolean = false;
  private _disposed: boolean = false;
  private _supportsEditing: boolean;
  private readonly _lockfile: LockFile | undefined;

  private constructor(
    cacheFilePath: string,
    loadedJson: IBuildCacheProviderCredentialCacheJson | undefined,
    lockfile: LockFile | undefined
  ) {
    this._cacheFilePath = cacheFilePath;
    this._cacheEntries = new Map<string, ICacheEntryJson>(Object.entries(loadedJson?.cacheEntries || {}));
    this._supportsEditing = !!lockfile;
    this._lockfile = lockfile;
  }

  public static async initializeAsync(
    rushGlobalFolder: RushGlobalFolder,
    supportEditing: boolean
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

    let lockfile: LockFile | undefined;
    if (supportEditing) {
      lockfile = await LockFile.acquire(rushGlobalFolder.path, `${CACHE_FILENAME}.lock`);
    }

    const credentialCache: BuildCacheProviderCredentialCache = new BuildCacheProviderCredentialCache(
      cacheFilePath,
      loadedJson,
      lockfile
    );
    return credentialCache;
  }

  public setCacheEntry(cacheId: string, credential: string, expires?: Date): void {
    this._validate(true);

    const expiresMilliseconds: number = expires?.getTime() || 0;
    const existingCacheEntry: ICacheEntryJson | undefined = this._cacheEntries.get(cacheId);
    if (
      existingCacheEntry?.credential !== credential ||
      existingCacheEntry?.expires !== expiresMilliseconds
    ) {
      this._modified = true;
      this._cacheEntries.set(cacheId, {
        expires: expiresMilliseconds,
        credential
      });
    }
  }

  public tryGetCacheEntry(cacheId: string): IBuildCacheProviderCredentialCacheEntry | undefined {
    this._validate(false);

    const cacheEntry: ICacheEntryJson | undefined = this._cacheEntries.get(cacheId);
    if (cacheEntry) {
      const result: IBuildCacheProviderCredentialCacheEntry = {
        expires: cacheEntry.expires ? new Date(cacheEntry.expires) : undefined,
        credential: cacheEntry.credential
      };

      return result;
    } else {
      return undefined;
    }
  }

  public deleteCacheEntry(cacheId: string): void {
    this._validate(true);

    if (this._cacheEntries.has(cacheId)) {
      this._modified = true;
      this._cacheEntries.delete(cacheId);
    }
  }

  public trimExpiredEntries(): void {
    this._validate(true);

    const now: number = Date.now();
    for (const [cacheId, cacheEntry] of this._cacheEntries.entries()) {
      if (cacheEntry.expires < now) {
        this._cacheEntries.delete(cacheId);
        this._modified = true;
      }
    }
  }

  public async saveIfModifiedAsync(): Promise<void> {
    this._validate(true);

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

  public dispose(): void {
    this._lockfile?.release();
    this._disposed = true;
  }

  private _validate(requiresEditing: boolean): void {
    if (!this._supportsEditing && requiresEditing) {
      throw new Error(`This instance of ${BuildCacheProviderCredentialCache.name} does not support editing.`);
    }

    if (this._disposed) {
      throw new Error(`This instance of ${BuildCacheProviderCredentialCache.name} has been disposed.`);
    }
  }
}
