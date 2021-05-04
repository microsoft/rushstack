// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';
import type { IPnpmShrinkwrapYaml } from './PnpmShrinkwrapFile';

/**
 * The `settings` parameter passed to {@link IPnpmfileShim.hooks.readPackage} and
 * {@link IPnpmfileShim.hooks.afterAllResolved}.
 */
export interface IPnpmfileShimSettings {
  semverPath: string;
  allPreferredVersions: { [dependencyName: string]: string };
  allowedAlternativeVersions: { [dependencyName: string]: ReadonlyArray<string> };
  clientPnpmfilePath?: string;
}

/**
 * The `context` parameter passed to {@link IPnpmfile.hooks.readPackage}, as defined by the
 * pnpmfile API contract.
 */
export interface IPnpmfileContext {
  log: (message: string) => void;
  pnpmfileShimSettings?: IPnpmfileShimSettings;
}

/**
 * The pnpmfile, as defined by the pnpmfile API contract.
 */
export interface IPnpmfile {
  hooks?: {
    afterAllResolved?: (lockfile: IPnpmShrinkwrapYaml, context: IPnpmfileContext) => IPnpmShrinkwrapYaml;
    readPackage?: (pkg: IPackageJson, context: IPnpmfileContext) => IPackageJson;
  };
}
