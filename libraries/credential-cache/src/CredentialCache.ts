// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, JsonSchema, LockFile, User, Objects } from '@rushstack/node-core-library';

import schemaJson from './schemas/credentials.schema.json';

/**
 * The name of the default folder in the user's home directory where Rush stores user-specific data.
 * @public
 */
export const RUSH_USER_FOLDER_NAME: '.rush-user' = '.rush-user';

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
 * @public
 */
export interface ICredentialCacheEntry {
  expires?: Date;
  credential: string;
  credentialMetadata?: object;
}

/**
 * @public
 */
export interface ICredentialCacheOptions {
  supportEditing: boolean;
  cacheFilePath?: string;
}

/**
 * @public
 */
export class CredentialCache implements Disposable {
  readonly #cacheFilePath: string;
  readonly #cacheEntries: Map<string, ICacheEntryJson>;
  #modified: boolean = false;
  #disposed: boolean = false;
  readonly #supportsEditing: boolean;
  readonly #lockfile: LockFile | undefined;

  private constructor(
    cacheFilePath: string,
    loadedJson: ICredentialCacheJson | undefined,
    lockfile: LockFile | undefined
  ) {
    if (loadedJson && loadedJson.version !== LATEST_CREDENTIALS_JSON_VERSION) {
      throw new Error(`Unexpected ${cacheFilePath} file version: ${loadedJson.version}`);
    }

    this.#cacheFilePath = cacheFilePath;
    this.#cacheEntries = new Map<string, ICacheEntryJson>(Object.entries(loadedJson?.cacheEntries || {}));
    this.#supportsEditing = !!lockfile;
    this.#lockfile = lockfile;
  }

  public static async initializeAsync(options: ICredentialCacheOptions): Promise<CredentialCache> {
    let cacheDirectory: string;
    let cacheFileName: string;
    if (options.cacheFilePath) {
      cacheDirectory = path.dirname(options.cacheFilePath);
      cacheFileName = options.cacheFilePath.slice(cacheDirectory.length + 1);
    } else {
      cacheDirectory = `${User.getHomeFolder()}/${RUSH_USER_FOLDER_NAME}`;
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
    const cache: CredentialCache = await CredentialCache.initializeAsync(options);
    try {
      await doActionAsync(cache);
    } finally {
      cache.dispose();
    }
  }

  public setCacheEntry(cacheId: string, entry: ICredentialCacheEntry): void {
    this.#validate(true);

    const { expires, credential, credentialMetadata } = entry;
    const expiresMilliseconds: number = expires?.getTime() || 0;
    const existingCacheEntry: ICacheEntryJson | undefined = this.#cacheEntries.get(cacheId);
    if (
      existingCacheEntry?.credential !== credential ||
      existingCacheEntry?.expires !== expiresMilliseconds ||
      !Objects.areDeepEqual(existingCacheEntry?.credentialMetadata, credentialMetadata)
    ) {
      this.#modified = true;
      this.#cacheEntries.set(cacheId, {
        expires: expiresMilliseconds,
        credential,
        credentialMetadata
      });
    }
  }

  public tryGetCacheEntry(cacheId: string): ICredentialCacheEntry | undefined {
    this.#validate(false);

    const cacheEntry: ICacheEntryJson | undefined = this.#cacheEntries.get(cacheId);
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
    this.#validate(true);

    if (this.#cacheEntries.has(cacheId)) {
      this.#modified = true;
      this.#cacheEntries.delete(cacheId);
    }
  }

  public trimExpiredEntries(): void {
    this.#validate(true);

    const now: number = Date.now();
    for (const [cacheId, cacheEntry] of this.#cacheEntries.entries()) {
      if (cacheEntry.expires < now) {
        this.#cacheEntries.delete(cacheId);
        this.#modified = true;
      }
    }
  }

  public async saveIfModifiedAsync(): Promise<void> {
    this.#validate(true);

    if (this.#modified) {
      const cacheEntriesJson: { [cacheId: string]: ICacheEntryJson } = {};
      for (const [cacheId, cacheEntry] of this.#cacheEntries.entries()) {
        cacheEntriesJson[cacheId] = cacheEntry;
      }

      const newJson: ICredentialCacheJson = {
        version: LATEST_CREDENTIALS_JSON_VERSION,
        cacheEntries: cacheEntriesJson
      };
      await JsonFile.saveAsync(newJson, this.#cacheFilePath, {
        ensureFolderExists: true,
        updateExistingFile: true,
        ignoreUndefinedValues: true
      });

      this.#modified = false;
    }
  }

  public [Symbol.dispose](): void {
    this.dispose();
  }

  public dispose(): void {
    this.#lockfile?.release();
    this.#disposed = true;
  }

  #validate(requiresEditing: boolean): void {
    if (!this.#supportsEditing && requiresEditing) {
      throw new Error(`This instance of ${CredentialCache.name} does not support editing.`);
    }

    if (this.#disposed) {
      throw new Error(`This instance of ${CredentialCache.name} has been disposed.`);
    }
  }
}
