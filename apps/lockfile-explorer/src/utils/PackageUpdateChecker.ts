// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { homedir } from 'node:os';

import semver from 'semver';

import { type IPackageJson, JsonFile } from '@rushstack/node-core-library';

/**
 * TODO: If we end up expecting to use this elsewhere, we should move this to
 * either its own package or into `@rushstack/node-core-library`.
 */

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
  try {
    const response: Response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      return undefined;
    }

    const { version } = (await response.json()) as IPackageJson;
    return typeof version === 'string' ? version : undefined;
  } catch {
    // Network errors, timeouts, and parse failures are all silent.
    return undefined;
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
  readonly #packageName: string;
  readonly #currentVersion: string;
  readonly #skip: boolean;
  readonly #forceCheck: boolean;
  readonly #cacheExpiryMs: number;

  public constructor(options: IPackageUpdateCheckerOptions) {
    const {
      packageName,
      currentVersion,
      skip = false,
      forceCheck = false,
      cacheExpiryMs = DEFAULT_CACHE_EXPIRY_MS
    } = options;
    this.#packageName = packageName;
    this.#currentVersion = currentVersion;
    this.#skip = skip;
    this.#forceCheck = forceCheck;
    this.#cacheExpiryMs = cacheExpiryMs;
  }

  /**
   * Performs the update check and returns the result, or `undefined` if the check
   * was skipped or the registry could not be reached.
   */
  public async tryGetUpdateAsync(): Promise<IPackageUpdateResult | undefined> {
    if (this.#skip) {
      return undefined;
    }

    const cacheFilePath: string = this.#getCacheFilePath();

    let latestVersion: string | undefined;
    if (!this.#forceCheck) {
      const cached: IUpdateCheckCache | undefined = await _readCacheAsync(cacheFilePath);
      if (cached !== undefined) {
        const { checkedAt, latestVersion: latestVersionFromCache } = cached;
        const ageMs: number = Date.now() - checkedAt;
        if (ageMs < this.#cacheExpiryMs) {
          latestVersion = latestVersionFromCache;
        }
      }
    }

    if (latestVersion === undefined) {
      // Cache is missing or stale — fetch from the registry.
      latestVersion = await _tryFetchLatestVersionAsync(this.#packageName);
      if (latestVersion === undefined) {
        return undefined;
      }

      await _writeCacheAsync(cacheFilePath, { latestVersion });
    }

    return {
      latestVersion,
      isOutdated: semver.gt(latestVersion, this.#currentVersion)
    };
  }

  #getCacheFilePath(): string {
    // Replace characters that are unsafe in file names (e.g. the "/" in scoped package names).
    const sanitizedName: string = this.#packageName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${CACHE_FOLDER}/${sanitizedName}.json`;
  }
}
