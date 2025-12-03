// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as pnpmKitV8 from '@rushstack/rush-pnpm-kit-v8';

import type { IPackageJson } from '@rushstack/node-core-library';

import type { IPnpmShrinkwrapYaml } from './PnpmShrinkwrapFile';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';

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

export interface IWorkspaceProjectInfo
  extends Pick<RushConfigurationProject, 'packageName' | 'projectRelativeFolder'> {
  packageVersion: RushConfigurationProject['packageJson']['version'];
  injectedDependencies: Array<string>;
}

/**
 * The `settings` parameter passed to {@link IPnpmfileShim.hooks.readPackage} and
 * {@link IPnpmfileShim.hooks.afterAllResolved}.
 */
export interface ISubspacePnpmfileShimSettings {
  semverPath: string;
  workspaceProjects: Record<string, IWorkspaceProjectInfo>;
  subspaceProjects: Record<string, IWorkspaceProjectInfo>;
  userPnpmfilePath?: string;
}

/**
 * The `context` parameter passed to {@link IPnpmfile.hooks.readPackage}, as defined by the
 * pnpmfile API contract.
 */
export interface IPnpmfileContext {
  log: (message: string) => void;
  pnpmfileShimSettings?: IPnpmfileShimSettings;
  subspacePnpmfileShimSettings?: ISubspacePnpmfileShimSettings;
}

/**
 * The `log` parameter passed to {@link IPnpmfile.hooks.filterLog}.
 */
export type IPnpmLog = pnpmKitV8.logger.LogBase & {
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
