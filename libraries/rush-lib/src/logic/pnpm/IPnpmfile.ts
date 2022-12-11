// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LogBase } from '@pnpm/logger';
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
  /**
   * The versions of all packages that are part of the workspace.
   */
  workspaceVersions: Record<string, string>;
  userPnpmfilePath?: string;
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
 * The `log` parameter passed to {@link IPnpmfile.hooks.filterLog}.
 */
export type IPnpmLog = LogBase & {
  [key: string]: unknown;
};

/**
 * The 'hooks' property of the pnpmfile
 */
export interface IPnpmfileHooks {
  afterAllResolved?: (lockfile: IPnpmShrinkwrapYaml, context: IPnpmfileContext) => IPnpmShrinkwrapYaml;
  readPackage?: (pkg: IPackageJson, context: IPnpmfileContext) => IPackageJson;
  /**
   * @remarks
   * This function is not supported by PNPM versions before 6.17.0.
   */
  filterLog?: (log: IPnpmLog) => boolean;
}

/**
 * The pnpmfile, as defined by the pnpmfile API contract.
 */
export interface IPnpmfile {
  hooks?: IPnpmfileHooks;
}
