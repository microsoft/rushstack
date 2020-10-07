// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IPnpmfileShimSettings {
  allPreferredVersions: { [dependencyName: string]: string };
  allowedAlternativeVersions: { [dependencyName: string]: ReadonlyArray<string> };
  /**
   * Path to `@rushstack/node-core-library`
   */
  coreLibraryPath: string;
  /**
   * Path to `semver`
   */
  semverPath: string;
  useClientPnpmfile: boolean;
}
