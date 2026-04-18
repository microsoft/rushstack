// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { homedir } from 'node:os';

import semver from 'semver';

import { type IPackageJson, JsonFile } from '@rushstack/node-core-library';

/**
 * Options for {@link _PackageUpdateChecker}.
 *
 * @internal
 */
export interface IPackageUpdateCheckerOptions {
  /**
   * The npm package name to check for updates.
   */
  packageName: string;

  /**
   * The currently installed version.
   */
  currentVersion: string;

  /**
   * If `true`, skip the update check entirely.
   * Use this to suppress checks in CI environments or non-interactive sessions.
   *
   * @defaultValue false
   */
  skip?: boolean;

  /**
   * If `true`, bypass the cache and always fetch from the registry.
   * Useful in debug/verbose modes where you want an immediate, authoritative answer.
   *
   * @defaultValue false
   */
  forceCheck?: boolean;

  /**
   * How long (in milliseconds) to consider a cached registry response fresh
   * before re-fetching.
   *
   * @defaultValue 86400000 (24 hours)
   */
  cacheExpiryMs?: number;
}

/**
 * The result of an update check.
 *
 * @internal
 */
export interface IPackageUpdateResult {
  /**
   * The latest version available on the registry.
   */
  latestVersion: string;

  /**
   * `true` if {@link _IPackageUpdateResult.latestVersion} is strictly newer than
   * the {@link _IPackageUpdateCheckerOptions.currentVersion} that was passed to the checker.
   */
  isOutdated: boolean;
}

interface IUpdateCheckCache {
  checkedAt: number;
  latestVersion: string;
}

interface IUpdateCheckCacheOnDisk extends IUpdateCheckCache {
  cacheVersion: typeof CACHE_VERSION;
}

const REGISTRY_BASE_URL: 'https://registry.npmjs.org' = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS: 5000 = 5000;
const DEFAULT_CACHE_EXPIRY_MS: number = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_VERSION: 1 = 1;
const CACHE_FOLDER: string = `${homedir()}/.rushstack/update-checks`;

async function _tryFetchLatestVersionAsync(packageName: string): Promise<string | undefined> {
  const url: string = `${REGISTRY_BASE_URL}/${encodeURIComponent(packageName)}/latest`;
  const controller: AbortController = new AbortController();
  const timeout: NodeJS.Timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response: Response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }

    const { version } = (await response.json()) as IPackageJson;
    return typeof version === 'string' ? version : undefined;
  } catch {
    // Network errors, timeouts, and parse failures are all silent.
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function _readCacheAsync(filePath: string): Promise<IUpdateCheckCache | undefined> {
  try {
    const data: IUpdateCheckCacheOnDisk = await JsonFile.loadAsync(filePath);
    const { cacheVersion, ...rest } = data;
    if (cacheVersion === CACHE_VERSION) {
      return rest;
    }
  } catch {
    // Ignore
  }
}

async function _writeCacheAsync(
  filePath: string,
  cache: Omit<IUpdateCheckCache, 'checkedAt'>
): Promise<void> {
  try {
    const cacheData: IUpdateCheckCacheOnDisk = {
      cacheVersion: CACHE_VERSION,
      checkedAt: Date.now(),
      ...cache
    };
    await JsonFile.saveAsync(cacheData, filePath, {
      ensureFolderExists: true
    });
  } catch {
    // Cache write failures are silent — a stale or missing cache just means
    // we'll re-fetch on the next invocation.
  }
}

/**
 * Checks npm for a newer version of a package and caches the result locally so that
 * the registry is not queried on every invocation.
 *
 * @internal
 */
export class PackageUpdateChecker {
  private readonly _packageName: string;
  private readonly _currentVersion: string;
  private readonly _skip: boolean;
  private readonly _forceCheck: boolean;
  private readonly _cacheExpiryMs: number;

  public constructor(options: IPackageUpdateCheckerOptions) {
    const {
      packageName,
      currentVersion,
      skip = false,
      forceCheck = false,
      cacheExpiryMs = DEFAULT_CACHE_EXPIRY_MS
    } = options;
    this._packageName = packageName;
    this._currentVersion = currentVersion;
    this._skip = skip;
    this._forceCheck = forceCheck;
    this._cacheExpiryMs = cacheExpiryMs;
  }

  /**
   * Performs the update check and returns the result, or `undefined` if the check
   * was skipped or the registry could not be reached.
   */
  public async tryGetUpdateAsync(): Promise<IPackageUpdateResult | undefined> {
    if (this._skip) {
      return undefined;
    }

    const cacheFilePath: string = this._getCacheFilePath();

    let latestVersion: string | undefined;
    if (!this._forceCheck) {
      const cached: IUpdateCheckCache | undefined = await _readCacheAsync(cacheFilePath);
      if (cached !== undefined) {
        const { checkedAt, latestVersion: latestVersionFromCache } = cached;
        const ageMs: number = Date.now() - checkedAt;
        if (ageMs < this._cacheExpiryMs) {
          latestVersion = latestVersionFromCache;
        }
      }
    }

    if (latestVersion === undefined) {
      // Cache is missing or stale — fetch from the registry.
      latestVersion = await _tryFetchLatestVersionAsync(this._packageName);
      if (latestVersion === undefined) {
        return undefined;
      }

      await _writeCacheAsync(cacheFilePath, { latestVersion });
    }

    return {
      latestVersion,
      isOutdated: semver.gt(latestVersion, this._currentVersion)
    };
  }

  private _getCacheFilePath(): string {
    // Replace characters that are unsafe in file names (e.g. the "/" in scoped package names).
    const sanitizedName: string = this._packageName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${CACHE_FOLDER}/${sanitizedName}.json`;
  }
}
