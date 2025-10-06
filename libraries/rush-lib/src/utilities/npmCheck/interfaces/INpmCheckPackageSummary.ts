// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// semverDiff still returns null
export type INpmCheckVersionBumpType =
  | ''
  | 'build'
  | 'major'
  | 'premajor'
  | 'minor'
  | 'preminor'
  | 'patch'
  | 'prepatch'
  | 'prerelease'
  | 'nonSemver'
  | undefined
  // eslint-disable-next-line @rushstack/no-new-null
  | null;

export interface INpmCheckPackageSummary {
  moduleName: string; //USED,  name of the module.
  homepage: string; // USED, url to the home page.
  regError?: Error; // USED, error communicating with the registry
  pkgError?: Error; // USED, error reading the package.json
  latest: string; // USED, latest according to the registry.
  installed: string; // USED, version installed
  notInstalled: boolean; // USED Is it installed?
  packageJson: string; // USED, Version or range requested in the parent package.json.
  devDependency: boolean; // USED, Is this a devDependency?
  mismatch: boolean; // USED, Does the version installed not match the range in package.json?
  bump?: INpmCheckVersionBumpType; //USED,  What kind of bump is required to get the latest
}
