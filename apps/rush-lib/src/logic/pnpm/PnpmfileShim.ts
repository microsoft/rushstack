// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Uncomment "/* type */" when we upgrade to TS 3.9
import { /* type */ IPackageJson } from '@rushstack/node-core-library';
import { /* type */ IPnpmfileShimSettings } from './IPnpmfileShimSettings';
import /* type */ * as TSemver from 'semver';

interface ILockfile {}

interface IPnpmfile {
  hooks?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterAllResolved?: (lockfile: ILockfile, context: any) => ILockfile;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readPackage?: (pkg: IPackageJson, context: any) => IPackageJson;
  };
}

// Load in the generated settings file
const pnpmfileSettings: IPnpmfileShimSettings = require('./pnpmfileSettings.json');
// We will require semver from this path on disk, since this is the version of semver shipping with Rush
const semver: typeof TSemver = require(pnpmfileSettings.semverPath);
// Only require the client pnpmfile if requested
const clientPnpmfile: IPnpmfile | undefined = pnpmfileSettings.useClientPnpmfile
  ? require('./clientPnpmfile')
  : undefined;

const convertToSemverRange = ([dep, specifier]: [string, string]): [string, TSemver.Range] | undefined => {
  try {
    const range: TSemver.Range = new semver.Range(specifier);
    return [dep, range];
  } catch (err) {
    return;
  }
};

const preferredVersions: Map<string, TSemver.Range> = new Map(
  Object.entries(pnpmfileSettings.allPreferredVersions).map(convertToSemverRange).filter(Boolean)
);

// Any time the preferred version is a subset of the dependency version, use it instead.
// Allowed alternative versions are only for `rush check` validation
function setPreferredVersions(dependencies?: { [dependencyName: string]: string }): void {
  if (!dependencies) {
    return;
  }

  for (const [dep, specifier] of Object.entries(dependencies)) {
    const preferredRange: TSemver.Range | undefined = preferredVersions.get(dep);
    if (!preferredRange) {
      // No preferred version, ignore
      continue;
    }

    try {
      const existingRange: TSemver.Range = new semver.Range(specifier);
      if (semver.subset(preferredRange, existingRange)) {
        dependencies[dep] = preferredRange.toString();
      }
    } catch (err) {
      // If the existing specifier isn't a valid semver range, ignore it
      continue;
    }
  }
}

const pnpmfileShim: IPnpmfile = {
  hooks: {
    // Call the original pnpmfile (if it exists)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterAllResolved: (lockfile: ILockfile, context: any) => {
      return clientPnpmfile && clientPnpmfile.hooks && clientPnpmfile.hooks.afterAllResolved
        ? clientPnpmfile.hooks.afterAllResolved(lockfile, context)
        : lockfile;
    },

    // Set the preferred versions in the package, then call the original pnpmfile (if it exists)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readPackage: (pkg: IPackageJson, context: any) => {
      setPreferredVersions(pkg.dependencies);
      setPreferredVersions(pkg.devDependencies);
      setPreferredVersions(pkg.optionalDependencies);
      return clientPnpmfile && clientPnpmfile.hooks && clientPnpmfile.hooks.readPackage
        ? clientPnpmfile.hooks.readPackage(pkg, context)
        : pkg;
    }
  }
};

export = pnpmfileShim;
