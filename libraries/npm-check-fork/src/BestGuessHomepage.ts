// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { INpmCheckPackageVersion, INpmCheckRegistryData } from './interfaces/INpmCheckRegistry';
import { toHttpsUrl } from './toHttpsUrl';

export default function bestGuessHomepage(data: INpmCheckRegistryData | undefined): string | false {
  if (!data) {
    return false;
  }
  const packageDataForLatest: INpmCheckPackageVersion = data.versions[data['dist-tags'].latest];

  return packageDataForLatest
    ? packageDataForLatest.homepage ||
        (packageDataForLatest.bugs &&
          packageDataForLatest.bugs.url &&
          toHttpsUrl(packageDataForLatest.bugs.url.trim())) ||
        (packageDataForLatest.repository &&
          packageDataForLatest.repository.url &&
          toHttpsUrl(packageDataForLatest.repository.url.trim())) ||
        false
    : false;
}
