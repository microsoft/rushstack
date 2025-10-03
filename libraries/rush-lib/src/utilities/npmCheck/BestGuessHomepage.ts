// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="../../types/giturl-typings.d.ts" preserve="true" />

import gitUrl from 'giturl';
import type { INpmCheckPackageVersion, INpmCheckRegistryData } from './interfaces/INpmCheckRegistry';

export default function bestGuessHomepage(data: INpmCheckRegistryData | undefined): string | false {
  if (!data) {
    return false;
  }
  const packageDataForLatest: INpmCheckPackageVersion = data.versions[data['dist-tags'].latest];

  return packageDataForLatest
    ? packageDataForLatest.homepage ||
        (packageDataForLatest.bugs &&
          packageDataForLatest.bugs.url &&
          gitUrl.parse(packageDataForLatest.bugs.url.trim())) ||
        (packageDataForLatest.repository &&
          packageDataForLatest.repository.url &&
          gitUrl.parse(packageDataForLatest.repository.url.trim())) ||
        false
    : false;
}
