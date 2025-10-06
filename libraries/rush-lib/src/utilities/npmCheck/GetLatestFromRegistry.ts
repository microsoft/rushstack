// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';

import _ from 'lodash';
import semver from 'semver';
import packageJson from 'package-json';
import throat from 'throat';

import bestGuessHomepage from './BestGuessHomepage';
import type { INpmRegistryInfo } from './interfaces/INpmCheckRegistry';

const cpuCount: number = os.cpus().length;

export default async function getNpmInfo(packageName: string): Promise<INpmRegistryInfo> {
  const limit: () => Promise<packageJson.FullMetadata> = throat(cpuCount, () =>
    packageJson(packageName, { fullMetadata: true, allVersions: true })
  );
  return limit()
    .then((rawData: packageJson.FullMetadata) => {
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

      return {
        latest: latestStableRelease,
        next: next,
        versions: sortedVersions,
        homepage: bestGuessHomepage(rawData) || ''
      };
    })
    .catch((error) => {
      const errorMessage: string = `Registry error ${error.message}`;
      return {
        error: errorMessage
      };
    });
}
