// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';

import _ from 'lodash';
import semver from 'semver';

import { Async } from '@rushstack/node-core-library';

import bestGuessHomepage from './BestGuessHomepage.ts';
import { NpmRegistryClient, type INpmRegistryClientResult } from './NpmRegistryClient.ts';
import type {
  INpmRegistryInfo,
  INpmCheckRegistryData,
  INpmRegistryPackageResponse
} from './interfaces/INpmCheckRegistry.ts';

// Module-level registry client instance (lazy initialized)
let _registryClient: NpmRegistryClient | undefined;

/**
 * Gets or creates the shared registry client instance.
 */
function getRegistryClient(): NpmRegistryClient {
  if (!_registryClient) {
    _registryClient = new NpmRegistryClient();
  }
  return _registryClient;
}

/**
 * Fetches package information from the npm registry.
 *
 * @param packageName - The name of the package to fetch
 * @returns A promise that resolves to the package registry info
 */
export default async function getNpmInfo(packageName: string): Promise<INpmRegistryInfo> {
  const client: NpmRegistryClient = getRegistryClient();
  const result: INpmRegistryClientResult = await client.fetchPackageMetadataAsync(packageName);

  if (result.error) {
    return {
      error: `Registry error ${result.error}`
    };
  }

  const rawData: INpmRegistryPackageResponse = result.data!;
  const CRAZY_HIGH_SEMVER: string = '8000.0.0';
  const sortedVersions: string[] = _(rawData.versions)
    .keys()
    .remove((version: string) => semver.gt(CRAZY_HIGH_SEMVER, version))
    .sort(semver.compare)
    .valueOf();

  const latest: string = rawData['dist-tags'].latest;
  const next: string = rawData['dist-tags'].next;
  const latestStableRelease: string | undefined = semver.satisfies(latest, '*')
    ? latest
    : semver.maxSatisfying(sortedVersions, '*') || '';

  // Cast to INpmCheckRegistryData for bestGuessHomepage compatibility
  // INpmRegistryPackageResponse is a superset of INpmCheckRegistryData
  const registryData: INpmCheckRegistryData = rawData as unknown as INpmCheckRegistryData;

  return {
    latest: latestStableRelease,
    next: next,
    versions: sortedVersions,
    homepage: bestGuessHomepage(registryData) || ''
  };
}

/**
 * Fetches package information for multiple packages concurrently.
 *
 * @param packageNames - Array of package names to fetch
 * @param concurrency - Maximum number of concurrent requests (defaults to CPU count)
 * @returns A promise that resolves to a Map of package name to registry info
 */
export async function getNpmInfoBatch(
  packageNames: string[],
  concurrency: number = os.cpus().length
): Promise<Map<string, INpmRegistryInfo>> {
  const results: Map<string, INpmRegistryInfo> = new Map();

  // TODO: Refactor createPackageSummary to use this batch function to reduce registry requests
  await Async.forEachAsync(
    packageNames,
    async (packageName: string) => {
      results.set(packageName, await getNpmInfo(packageName));
    },
    { concurrency }
  );

  return results;
}
