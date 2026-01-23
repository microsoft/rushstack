// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import _ from 'lodash';
import semver from 'semver';

import bestGuessHomepage from './BestGuessHomepage';
import { NpmRegistryClient, type INpmRegistryClientResult } from './NpmRegistryClient';
import type {
  INpmRegistryInfo,
  INpmCheckRegistryData,
  INpmRegistryPackageResponse
} from './interfaces/INpmCheckRegistry';

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
    .remove(_.partial(semver.gt, CRAZY_HIGH_SEMVER))
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
