// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The "rush install" or "rush update" commands will copy this template to
// "common/temp/<pnpmfile.js|.pnpmfile.cjs>" so that it can implement Rush-specific features such as
// implicitly preferred versions. It reads its input data from "common/temp/pnpmfileSettings.json".
// The pnpmfile is required directly by this shim and is called after Rush's transformations are applied.

// This file can use "import type" but otherwise should not reference any other modules, since it will
// be run from the "common/temp" directory
import type * as TSemver from 'semver';

import type { IPackageJson } from '@rushstack/node-core-library';

import type { IPnpmShrinkwrapYaml } from './PnpmShrinkwrapFile';
import type { IPnpmfile, IPnpmfileShimSettings, IPnpmfileContext, IPnpmfileHooks } from './IPnpmfile';

let settings: IPnpmfileShimSettings | undefined;
let allPreferredVersions: Map<string, string> | undefined;
let rangeParseCache: Map<string, TSemver.Range | false> | undefined;
let allowedAlternativeVersions: Map<string, Set<string>> | undefined;
let workspaceVersions: Map<string, string> | undefined;
let userPnpmfile: IPnpmfile | undefined;
let semver: typeof TSemver | undefined;

// All calls to new semver.Range and the comparison functions need to have the same options
// It can be a different object with the same properties, but reusing this const avoids allocations
const SEMVER_COMPARE_OPTIONS: TSemver.RangeOptions = { includePrerelease: true };

// Resets the internal state of the pnpmfile
export function reset(): void {
  settings = undefined;
  allPreferredVersions = undefined;
  allowedAlternativeVersions = undefined;
  workspaceVersions = undefined;
  rangeParseCache = undefined;
  userPnpmfile = undefined;
  semver = undefined;
}

// Initialize all external aspects of the pnpmfile shim. When using the shim, settings
// are always expected to be available. Init must be called before running any hook that
// depends on a resource obtained from or related to the settings, and will require modules
// once so they aren't repeatedly required in the hook functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(context: IPnpmfileContext | any): IPnpmfileContext {
  // Sometimes PNPM may provide us a context arg that doesn't fit spec, ex.:
  // https://github.com/pnpm/pnpm/blob/97c64bae4d14a8c8f05803f1d94075ee29c2df2f/packages/get-context/src/index.ts#L134
  // So we need to normalize the context format before we move on
  if (typeof context !== 'object' || Array.isArray(context)) {
    context = {
      log: (message: string) => {},
      originalContext: context
    } as IPnpmfileContext;
  }
  if (!settings) {
    // Initialize the settings from file
    if (!context.pnpmfileShimSettings) {
      context.pnpmfileShimSettings = __non_webpack_require__('./pnpmfileSettings.json');
    }
    settings = context.pnpmfileShimSettings as IPnpmfileShimSettings;
  } else if (!context.pnpmfileShimSettings) {
    // Reuse the already initialized settings
    context.pnpmfileShimSettings = settings;
  }
  if (!allPreferredVersions && settings.allPreferredVersions) {
    allPreferredVersions = new Map(Object.entries(settings.allPreferredVersions));
    rangeParseCache = new Map();
  }
  if (!allowedAlternativeVersions && settings.allowedAlternativeVersions) {
    allowedAlternativeVersions = new Map(
      Object.entries(settings.allowedAlternativeVersions).map(([packageName, versions]) => {
        return [packageName, new Set(versions)];
      })
    );
  }
  if (!workspaceVersions && settings.workspaceVersions) {
    workspaceVersions = new Map(Object.entries(settings.workspaceVersions));
  }
  // If a userPnpmfilePath is provided, we expect it to exist
  if (!userPnpmfile && settings.userPnpmfilePath) {
    userPnpmfile = require(settings.userPnpmfilePath);
  }
  // If a semverPath is provided, we expect it to exist
  if (!semver && settings.semverPath) {
    semver = require(settings.semverPath);
  }
  // Return the normalized context
  return context as IPnpmfileContext;
}

function parseRange(range: string): TSemver.Range | false {
  if (!rangeParseCache || !semver) {
    return false;
  }

  const entry: TSemver.Range | false | undefined = rangeParseCache.get(range);
  if (entry !== undefined) {
    return entry;
  }

  if (range.includes(':')) {
    // This version specifier has a protocol (e.g. npm:, workspace:, etc.), so it is not a normal semver range.
    rangeParseCache.set(range, false);
    return false;
  }

  try {
    const parsedRange: TSemver.Range = new semver.Range(range, SEMVER_COMPARE_OPTIONS);
    rangeParseCache.set(range, parsedRange);
    return parsedRange;
  } catch {
    rangeParseCache.set(range, false);
    return false;
  }
}

// Set the preferred versions on the dependency map. If the version on the map is an allowedAlternativeVersion
// then skip it. Otherwise, check to ensure that the common version is a subset of the specified version. If
// it is, then replace the specified version with the preferredVersion
function setPreferredVersions(dependencies: { [dependencyName: string]: string } | undefined): void {
  if (!dependencies || !semver || !allPreferredVersions) {
    return;
  }

  // Needed for control flow analyzer.
  const definitelyDefinedAllPreferredVersions: Map<string, string> = allPreferredVersions;
  const definiteSemver: typeof TSemver = semver;

  Object.entries(dependencies).forEach(([name, version]: [string, string]) => {
    const preferredVersion: string | undefined = definitelyDefinedAllPreferredVersions.get(name);
    // If preferredVersionRange is valid and the current version is not an allowed alternative, proceed to check subsets
    if (preferredVersion && !allowedAlternativeVersions?.get(name)?.has(version)) {
      const preferredVersionRange: TSemver.Range | false = parseRange(preferredVersion);
      if (!preferredVersionRange) {
        return;
      }

      const versionRange: TSemver.Range | false = parseRange(version);
      if (!versionRange) {
        return;
      }

      if (definiteSemver.subset(preferredVersionRange, versionRange, SEMVER_COMPARE_OPTIONS)) {
        dependencies[name] = preferredVersion;
      }
    }
  });
}

export const hooks: IPnpmfileHooks = {
  // Call the original pnpmfile (if it exists)
  afterAllResolved: (lockfile: IPnpmShrinkwrapYaml, context: IPnpmfileContext) => {
    context = init(context);
    return userPnpmfile?.hooks?.afterAllResolved?.(lockfile, context) ?? lockfile;
  },

  // Set the preferred versions in the package, then call the original pnpmfile (if it exists)
  readPackage: (pkg: IPackageJson, context: IPnpmfileContext) => {
    context = init(context);
    // Apply the user pnpmfile readPackage hook first, in case it moves dependencies around, and so that it sees the true package.json
    pkg = userPnpmfile?.hooks?.readPackage?.(pkg, context) ?? pkg;

    // Then do version refinement of preferredVersions, since this is just supposed to act as if pnpm "prefers" these resolutions during
    // calculation.
    setPreferredVersions(pkg.dependencies);
    if (workspaceVersions && workspaceVersions.get(pkg.name) === pkg.version) {
      // devDependencies are only installed for workspace packages, so the rest of the time we can save the trouble of scanning.
      setPreferredVersions(pkg.devDependencies);
    }
    setPreferredVersions(pkg.optionalDependencies);
    return pkg;
  },

  // Call the original pnpmfile (if it exists)
  filterLog: userPnpmfile?.hooks?.filterLog
};
