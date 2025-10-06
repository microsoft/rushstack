// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import _ from 'lodash';

import type { INpmCheckOptions, INpmCheckPackageJson, INpmCheckState } from './interfaces/INpmCheck';
import initializeState from './NpmCheckState';
import createPackageSummary from './CreatePackageSummary';
import type { INpmCheckPackageSummary } from './interfaces/INpmCheckPackageSummary';

export default async function LocalNpmCheck(initialOptions?: INpmCheckOptions): Promise<INpmCheckState> {
  const state: INpmCheckState = await initializeState(initialOptions);
  const cwdPackageJson: INpmCheckPackageJson | undefined = state.cwdPackageJson;
  const allDependencies: Record<string, string> | undefined = getDependencies(cwdPackageJson);

  let packages: INpmCheckPackageSummary[] = [];
  if (allDependencies) {
    const packageSummaryPromises: Promise<INpmCheckPackageSummary | false>[] = Object.keys(
      allDependencies
    ).map((moduleName: string) => createPackageSummary(moduleName, state));
    packages = await Promise.all(packageSummaryPromises).then(
      (results: (INpmCheckPackageSummary | false)[]) => {
        return results.filter((pkg): pkg is INpmCheckPackageSummary => pkg !== false);
      }
    );
  }

  return { ...state, packages };
}

export function getDependencies(pkg: INpmCheckPackageJson | undefined): Record<string, string> | undefined {
  if (!pkg) {
    return undefined;
  }

  return _.extend(pkg.dependencies, pkg.devDependencies);
}
