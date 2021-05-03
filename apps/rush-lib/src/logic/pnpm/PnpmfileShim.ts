// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPnpmShrinkwrapYaml } from './PnpmShrinkwrapFile';
import type { IPnpmfile, IPnpmfileShimSettings, IPnpmfileContext } from './IPnpmfile';
import type { IPackageJson } from '@rushstack/node-core-library';
import type * as TSemver from 'semver';

let settings: IPnpmfileShimSettings;
let clientPnpmfile: IPnpmfile | undefined;
let semver: typeof TSemver | undefined;

// Initialize all external aspects of the pnpmfile shim. When using the shim, settings
// are always expected to be available. The rest can be considered additional and are
// not guaranteed at runtime. Init must be called before running any hook that depends
// on a resource obtained from or related to the settings, and will require modules
// once so they aren't repeatedly required in the hook functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(context: IPnpmfileContext | any): IPnpmfileContext {
  // Sometimes PNPM may provide us a context arg that doesn't fit spec, ex.:
  // https://github.com/pnpm/pnpm/blob/97c64bae4d14a8c8f05803f1d94075ee29c2df2f/packages/get-context/src/index.ts#L134
  // So we need to ensure the context format before we move on
  if (typeof context !== 'object' || Array.isArray(context)) {
    context = {
      log: (message: string) => {},
      originalContext: context
    } as IPnpmfileContext;
  }
  if (!settings) {
    // Initialize the settings from file
    if (!context.pnpmfileShimSettings) {
      context.pnpmfileShimSettings = require('./pnpmfileSettings.json');
    }
    settings = context.pnpmfileShimSettings!;
  } else if (!context.pnpmfileShimSettings) {
    // Reuse the already initialized settings
    context.pnpmfileShimSettings = settings;
  }
  if (!clientPnpmfile && settings.clientPnpmfilePath) {
    clientPnpmfile = require(settings.clientPnpmfilePath);
  }
  if (!semver && settings.semverPath) {
    semver = require(settings.semverPath);
  }
  return context as IPnpmfileContext;
}

// Set the preferred versions on the dependency map. If the version on the map is an allowedAlternativeVersion
// then skip it. Otherwise, check to ensure that the common version is a subset of the specified version. If
// it is, then replace the specified version with the preferredVersion
function setPreferredVersions(dependencies: { [dependencyName: string]: string } | undefined): void {
  for (const name of Object.keys(dependencies || {})) {
    if (settings.allPreferredVersions?.hasOwnProperty(name)) {
      const preferredVersion: string = settings.allPreferredVersions[name];
      const version: string = dependencies![name];
      if (settings.allowedAlternativeVersions?.hasOwnProperty(name)) {
        const allowedAlternatives: ReadonlyArray<string> | undefined =
          settings.allowedAlternativeVersions[name];
        if (allowedAlternatives && allowedAlternatives.indexOf(version) > -1) {
          continue;
        }
      }
      let isValidRange: boolean = false;
      try {
        isValidRange = !!semver!.validRange(preferredVersion) && !!semver!.validRange(version);
      } catch {
        // Swallow invalid range errors
      }
      if (isValidRange && semver!.subset(preferredVersion, version)) {
        dependencies![name] = preferredVersion;
      }
    }
  }
}

const pnpmfileShim: IPnpmfile = {
  hooks: {
    // Call the original pnpmfile (if it exists)
    afterAllResolved: (lockfile: IPnpmShrinkwrapYaml, context: IPnpmfileContext) => {
      context = init(context);
      return clientPnpmfile?.hooks?.afterAllResolved
        ? clientPnpmfile.hooks.afterAllResolved(lockfile, context)
        : lockfile;
    },

    // Set the preferred versions in the package, then call the original pnpmfile (if it exists)
    readPackage: (pkg: IPackageJson, context: IPnpmfileContext) => {
      context = init(context);
      setPreferredVersions(pkg.dependencies);
      setPreferredVersions(pkg.devDependencies);
      setPreferredVersions(pkg.optionalDependencies);
      return clientPnpmfile?.hooks?.readPackage ? clientPnpmfile.hooks.readPackage(pkg, context) : pkg;
    }
  }
};

export = pnpmfileShim;
