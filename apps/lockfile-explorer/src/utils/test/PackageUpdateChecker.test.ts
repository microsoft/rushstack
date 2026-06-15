// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';

import { PackageUpdateChecker } from '../PackageUpdateChecker';

const CURRENT_VERSION: string = '1.0.0';
const LATEST_VERSION: string = '2.0.0';
const PACKAGE_NAME: string = '@rushstack/test-pkg';

function makeFetchResponse(version: string, ok: boolean = true): Response {
  return {
    ok,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    json: async () => ({ version })
  } as unknown as Response;
}

function makeCacheEntry(latestVersion: string, ageMs: number = 0): object {
  return { cacheVersion: 1, checkedAt: Date.now() - ageMs, latestVersion };
}

describe(PackageUpdateChecker.name, () => {
  let fetchSpy: jest.SpyInstance;
  let loadSpy: jest.SpyInstance;
  let saveSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch' as never);
    loadSpy = jest.spyOn(JsonFile, 'loadAsync');
    saveSpy = jest.spyOn(JsonFile, 'saveAsync').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns undefined when skip is true', async () => {
    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION,
      skip: true
    });
    expect(await checker.tryGetUpdateAsync()).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('returns cached result without fetching when cache is fresh', async () => {
    loadSpy.mockResolvedValue(makeCacheEntry(LATEST_VERSION, 1000));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    const result = await checker.tryGetUpdateAsync();

    expect(result).toEqual({ latestVersion: LATEST_VERSION, isOutdated: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('fetches and writes cache when cache is stale', async () => {
    const oneDayMs: number = 24 * 60 * 60 * 1000;
    loadSpy.mockResolvedValue(makeCacheEntry(CURRENT_VERSION, oneDayMs + 1));
    fetchSpy.mockResolvedValue(makeFetchResponse(LATEST_VERSION));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    const result = await checker.tryGetUpdateAsync();

    expect(result).toEqual({ latestVersion: LATEST_VERSION, isOutdated: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('fetches and writes cache when no cache exists', async () => {
    loadSpy.mockRejectedValue(new Error('ENOENT'));
    fetchSpy.mockResolvedValue(makeFetchResponse(LATEST_VERSION));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    const result = await checker.tryGetUpdateAsync();

    expect(result).toEqual({ latestVersion: LATEST_VERSION, isOutdated: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache and fetches when forceCheck is true', async () => {
    loadSpy.mockResolvedValue(makeCacheEntry(CURRENT_VERSION, 0));
    fetchSpy.mockResolvedValue(makeFetchResponse(LATEST_VERSION));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION,
      forceCheck: true
    });
    const result = await checker.tryGetUpdateAsync();

    expect(result).toEqual({ latestVersion: LATEST_VERSION, isOutdated: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('returns undefined on network error', async () => {
    loadSpy.mockRejectedValue(new Error('ENOENT'));
    fetchSpy.mockRejectedValue(new Error('network error'));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    expect(await checker.tryGetUpdateAsync()).toBeUndefined();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('returns undefined on non-ok HTTP response', async () => {
    loadSpy.mockRejectedValue(new Error('ENOENT'));
    fetchSpy.mockResolvedValue(makeFetchResponse('', false));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    expect(await checker.tryGetUpdateAsync()).toBeUndefined();
  });

  it('sets isOutdated to false when already on latest', async () => {
    loadSpy.mockResolvedValue(makeCacheEntry(CURRENT_VERSION, 1000));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    const result = await checker.tryGetUpdateAsync();

    expect(result).toEqual({ latestVersion: CURRENT_VERSION, isOutdated: false });
  });

  it('ignores cache with wrong cacheVersion and re-fetches', async () => {
    loadSpy.mockResolvedValue({ cacheVersion: 99, checkedAt: Date.now(), latestVersion: CURRENT_VERSION });
    fetchSpy.mockResolvedValue(makeFetchResponse(LATEST_VERSION));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION
    });
    const result = await checker.tryGetUpdateAsync();

    expect(result).toEqual({ latestVersion: LATEST_VERSION, isOutdated: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses custom cacheExpiryMs', async () => {
    const shortExpiry: number = 5000;
    loadSpy.mockResolvedValue(makeCacheEntry(LATEST_VERSION, shortExpiry + 1));
    fetchSpy.mockResolvedValue(makeFetchResponse('3.0.0'));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: PACKAGE_NAME,
      currentVersion: CURRENT_VERSION,
      cacheExpiryMs: shortExpiry
    });
    const result = await checker.tryGetUpdateAsync();

    // Cache was stale by 1ms under the custom expiry, so a fresh fetch should have been made.
    expect(result?.latestVersion).toBe('3.0.0');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sanitizes scoped package name in cache file path', async () => {
    loadSpy.mockRejectedValue(new Error('ENOENT'));
    fetchSpy.mockResolvedValue(makeFetchResponse(LATEST_VERSION));

    const checker: PackageUpdateChecker = new PackageUpdateChecker({
      packageName: '@scope/pkg-name',
      currentVersion: CURRENT_VERSION
    });
    await checker.tryGetUpdateAsync();

    const savedPath: string = saveSpy.mock.calls[0][1] as string;
    expect(savedPath).toMatch(/_scope_pkg-name\.json$/);
  });
});
