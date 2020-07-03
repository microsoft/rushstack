// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface ILockfile {}

interface IPackageJson {
  dependencies?: { [dependencyName: string]: string };
  devDependencies?: { [dependencyName: string]: string };
  optionalDependencies?: { [dependencyName: string]: string };
}

interface IPnpmfile {
  hooks?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterAllResolved?: (lockfile: ILockfile, context: any) => ILockfile;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readPackage?: (pkg: IPackageJson, context: any) => IPackageJson;
  };
}

// Only require the client pnpmfile if it exists
const clientPnpmfile: IPnpmfile | undefined = JSON.parse('__pnpmfileExists')
  ? require('./clientPnpmfile')
  : undefined;
// We will require semver from this path on disk, since this is the version of semver shipping with Rush
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const semver: any = require('__semverPath');
const allPreferredVersions: { [dependencyName: string]: string } = JSON.parse('__allPreferredVersions');
const allowedAlternativeVersions: { [dependencyName: string]: string[] } = JSON.parse(
  '__allowedAlternativeVersions'
);

// Set the preferred versions on the dependency map. If the version on the map is an allowedAlternativeVersion
// then skip it. Otherwise, check to ensure that the common version is a subset of the specified version. If
// it is, then replace the specified version with the preferredVersion
function setPreferredVersions(dependencies?: { [dependencyName: string]: string }): void {
  for (const name of Object.keys(dependencies || {})) {
    if (allPreferredVersions.hasOwnProperty(name)) {
      const preferredVersion: string = allPreferredVersions[name];
      const version: string = dependencies![name];
      if (allowedAlternativeVersions.hasOwnProperty(name)) {
        const allowedAlternatives: string[] | undefined = allowedAlternativeVersions[name];
        if (allowedAlternatives && allowedAlternatives.indexOf(version) > -1) {
          continue;
        }
      }
      let isValidRange: boolean = false;
      try {
        isValidRange = !!semver.validRange(preferredVersion) && !!semver.validRange(version);
      } catch {
        // Swallow invalid range errors
      }
      if (isValidRange && semver.subset(preferredVersion, version)) {
        dependencies![name] = preferredVersion;
      }
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
