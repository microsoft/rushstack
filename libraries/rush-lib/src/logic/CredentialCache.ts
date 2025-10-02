// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem, JsonFile, JsonSchema, LockFile } from '@rushstack/node-core-library';

import { Utilities } from '../utilities/Utilities';
import { RushUserConfiguration } from '../api/RushUserConfiguration';
import schemaJson from '../schemas/credentials.schema.json';
import { objectsAreDeepEqual } from '../utilities/objectUtilities';

const DEFAULT_CACHE_FILENAME: 'credentials.json' = 'credentials.json';
const LATEST_CREDENTIALS_JSON_VERSION: string = '0.1.0';

interface ICredentialCacheJson {
  version: string;
  cacheEntries: {
    [credentialCacheId: string]: ICacheEntryJson;
  };
}

interface ICacheEntryJson {
  expires: number;
  credential: string;
  credentialMetadata?: object;
}

/**
 * @beta
 */
export interface ICredentialCacheEntry {
  expires?: Date;
  credential: string;
  credentialMetadata?: object;
}

/**
 * @beta
 */
export interface ICredentialCacheOptions {
  supportEditing: boolean;
  /**
   * If specified, use the specified path instead of the default path of `~/.rush-user/credentials.json`
   */
  cacheFilePath?: string;
}

/**
 * @beta
 */
export class CredentialCache /* implements IDisposable */ {
  private readonly _cacheFilePath: string;
  private readonly _cacheEntries: Map<string, ICacheEntryJson>;
  private _modified: boolean = false;
  private _disposed: boolean = false;
  private _supportsEditing: boolean;
  private readonly _lockfile: LockFile | undefined;

  private constructor(
    cacheFilePath: string,
    loadedJson: ICredentialCacheJson | undefined,
    lockfile: LockFile | undefined
  ) {
    if (loadedJson && loadedJson.version !== LATEST_CREDENTIALS_JSON_VERSION) {
      throw new Error(`Unexpected ${cacheFilePath} file version: ${loadedJson.version}`);
    }

    this._cacheFilePath = cacheFilePath;
    this._cacheEntries = new Map<string, ICacheEntryJson>(Object.entries(loadedJson?.cacheEntries || {}));
    this._supportsEditing = !!lockfile;
    this._lockfile = lockfile;
  }

  public static async initializeAsync(options: ICredentialCacheOptions): Promise<CredentialCache> {
    let cacheDirectory: string;
    let cacheFileName: string;
    if (options.cacheFilePath) {
      cacheDirectory = path.dirname(options.cacheFilePath);
      cacheFileName = options.cacheFilePath.slice(cacheDirectory.length + 1);
    } else {
      cacheDirectory = RushUserConfiguration.getRushUserFolderPath();
      cacheFileName = DEFAULT_CACHE_FILENAME;
    }
    const cacheFilePath: string = `${cacheDirectory}/${cacheFileName}`;

    const jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

    let loadedJson: ICredentialCacheJson | undefined;
    try {
      loadedJson = await JsonFile.loadAndValidateAsync(cacheFilePath, jsonSchema);
    } catch (e) {
      if (!FileSystem.isErrnoException(e as Error)) {
        throw e;
      }
    }

    let lockfile: LockFile | undefined;
    if (options.supportEditing) {
      lockfile = await LockFile.acquireAsync(cacheDirectory, `${cacheFileName}.lock`);
    }

    const credentialCache: CredentialCache = new CredentialCache(cacheFilePath, loadedJson, lockfile);
    return credentialCache;
  }

  public static async usingAsync(
    options: ICredentialCacheOptions,
    doActionAsync: (credentialCache: CredentialCache) => Promise<void> | void
  ): Promise<void> {
    await Utilities.usingAsync(async () => await CredentialCache.initializeAsync(options), doActionAsync);
  }

  public setCacheEntry(cacheId: string, entry: ICredentialCacheEntry): void {
    this._validate(true);

    const { expires, credential, credentialMetadata } = entry;
    const expiresMilliseconds: number = expires?.getTime() || 0;
    const existingCacheEntry: ICacheEntryJson | undefined = this._cacheEntries.get(cacheId);
    if (
      existingCacheEntry?.credential !== credential ||
      existingCacheEntry?.expires !== expiresMilliseconds ||
      !objectsAreDeepEqual(existingCacheEntry?.credentialMetadata, credentialMetadata)
    ) {
      this._modified = true;
      this._cacheEntries.set(cacheId, {
        expires: expiresMilliseconds,
        credential,
        credentialMetadata
      });
    }
  }

  public tryGetCacheEntry(cacheId: string): ICredentialCacheEntry | undefined {
    this._validate(false);

    const cacheEntry: ICacheEntryJson | undefined = this._cacheEntries.get(cacheId);
    if (cacheEntry) {
      const result: ICredentialCacheEntry = {
        expires: cacheEntry.expires ? new Date(cacheEntry.expires) : undefined,
        credential: cacheEntry.credential,
        credentialMetadata: cacheEntry.credentialMetadata
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

      const newJson: ICredentialCacheJson = {
        version: LATEST_CREDENTIALS_JSON_VERSION,
        cacheEntries: cacheEntriesJson
      };
      await JsonFile.saveAsync(newJson, this._cacheFilePath, {
        ensureFolderExists: true,
        updateExistingFile: true,
        ignoreUndefinedValues: true
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
      throw new Error(`This instance of ${CredentialCache.name} does not support editing.`);
    }

    if (this._disposed) {
      throw new Error(`This instance of ${CredentialCache.name} has been disposed.`);
    }
  }
}
