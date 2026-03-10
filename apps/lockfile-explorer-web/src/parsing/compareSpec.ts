// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '../types/IPackageJson.ts';

export interface ISpecChange {
  type: 'add' | 'remove' | 'diff';
  packageName: string;
  from?: string;
  to?: string;
}

/**
 * Calculate the diff between a package.json file and its transformed "package spec".
 *
 * @remarks
 * During installation, PNPM applies various transforms to `package.json` files, for example
 * .pnpmfile.cjs may add/remove/rewrite version ranges. The transformed result is called
 * the "package spec" by Lockfile Explorer, and its tab pane displays the diff between
 * the original `package.json` and the final spec.
 *
 * @returns A map of `ISpecChange` differences, looked up by package name. For example:
 *
 * 'react' --> { packageName: 'react', type: 'diff', from: '^16.0.0', to: '~16.2.0' }
 */
export const compareSpec = (
  packageJson: IPackageJson,
  packageSpec: IPackageJson
): Map<string, ISpecChange> => {
  // packageName -> packageVersion (For all dependencies in a package.json file)
  const packageJsonMap: Map<string, string> = new Map();
  // packageName -> packageVersion (For all dependencies in a parsed package.json file)
  const packageSpecMap: Map<string, string> = new Map();
  for (const [entry, version] of Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies
  })) {
    packageJsonMap.set(entry, version);
  }
  for (const [entry, version] of Object.entries({
    ...packageSpec.dependencies,
    ...packageSpec.devDependencies,
    ...packageSpec.peerDependencies
  })) {
    packageSpecMap.set(entry, version);
  }
  const differentDependencies: Map<string, ISpecChange> = new Map();

  for (const dependency of packageJsonMap.keys()) {
    if (!packageSpecMap.has(dependency)) {
      differentDependencies.set(dependency, {
        type: 'remove',
        packageName: dependency
      });
    } else if (packageSpecMap.get(dependency) !== packageJsonMap.get(dependency)) {
      differentDependencies.set(dependency, {
        type: 'diff',
        packageName: dependency,
        from: packageJsonMap.get(dependency),
        to: packageSpecMap.get(dependency)
      });
    }
  }

  for (const dependency of packageSpecMap.keys()) {
    if (!packageJsonMap.has(dependency)) {
      differentDependencies.set(dependency, {
        type: 'add',
        packageName: dependency
      });
    }
  }
  return differentDependencies;
};
