// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import extend from 'xtend';

import getUnusedPackages from './GetUnusedPackages';
import type { INpmCheckOptions, INpmCheckPackageJson, INpmCheckState } from './interfaces/INpmCheck';
import initializeState from './NpmCheckState';
import createPackageSummary from './CreatePackageSummary';
import type { INpmCheckPackageSummary } from './interfaces/INpmCheckPackageSummary';

export default async function LocalNpmCheck(initialOptions?: INpmCheckOptions): Promise<INpmCheckState> {
  const initialState: INpmCheckState = await initializeState(initialOptions);
  const state: INpmCheckState = await getUnusedPackages(initialState);
  const cwdPackageJson: INpmCheckPackageJson | undefined = state.cwdPackageJson;
  const allDependencies: Record<string, string> | undefined = getDependencies(state, cwdPackageJson);
  const allDependenciesIncludingMissing: string[] | undefined =
    allDependencies && state.missingFromPackageJson
      ? Object.keys(extend(allDependencies, state.missingFromPackageJson))
      : [];

  let packages: INpmCheckPackageSummary[] = [];
  if (allDependenciesIncludingMissing) {
    const packageSummaryPromises: Promise<INpmCheckPackageSummary | false>[] =
      allDependenciesIncludingMissing.map((moduleName: string) => createPackageSummary(moduleName, state));
    packages = await Promise.all(packageSummaryPromises).then(
      (results: (INpmCheckPackageSummary | false)[]) => {
        return results.filter((pkg): pkg is INpmCheckPackageSummary => pkg !== false);
      }
    );
  }

  return { ...state, packages };
}

export function getDependencies(
  state: INpmCheckState,
  pkg: INpmCheckPackageJson | undefined
): Record<string, string> | undefined {
  if (!pkg) {
    return undefined;
  }

  return extend(pkg.dependencies, pkg.devDependencies);
}
