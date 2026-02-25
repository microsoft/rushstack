// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

import type { Subspace } from '../../api/Subspace.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';

export interface IInstallManagerOptions {
  /**
   * Whether the global "--debug" flag was specified.
   */
  debug: boolean;

  /**
   * Whether or not Rush will automatically update the shrinkwrap file.
   * True for "rush update", false for "rush install".
   */
  allowShrinkwrapUpdates: boolean;

  /**
   * Whether to check the validation before install only, without actually installing anything.
   */
  checkOnly: boolean;

  /**
   * Whether to only run resolutions. Only supported for PNPM.
   */
  resolutionOnly?: boolean;

  /**
   * Whether a "--bypass-policy" flag can be specified.
   */
  bypassPolicyAllowed?: boolean;

  /**
   * Whether to skip policy checks.
   */
  bypassPolicy: boolean;

  /**
   * Whether to skip linking, i.e. require "rush link" to be done manually later.
   */
  noLink: boolean;

  /**
   * Whether to delete the shrinkwrap file before installation, i.e. so that all dependencies
   * will be upgraded to the latest SemVer-compatible version.
   */
  fullUpgrade: boolean;

  /**
   * If set, only update the shrinkwrap file; do not create node_modules.
   */
  onlyShrinkwrap?: boolean;

  /**
   * Whether to force an update to the shrinkwrap file even if it appears to be unnecessary.
   * Normally Rush uses heuristics to determine when "pnpm install" can be skipped,
   * but sometimes the heuristics can be inaccurate due to external influences
   * (pnpmfile.js script logic, registry changes, etc).
   */
  recheckShrinkwrap: boolean;

  /**
   * Do not attempt to access the network. Report an error if the required dependencies
   * cannot be obtained from the local cache.
   */
  offline: boolean;

  /**
   * The value of the "--network-concurrency" command-line parameter, which
   * is a diagnostic option used to troubleshoot network failures.
   *
   * Currently only supported for PNPM.
   */
  networkConcurrency: number | undefined;

  /**
   * Whether or not to collect verbose logs from the package manager.
   * If specified when using PNPM, the logs will be in /common/temp/pnpm.log
   */
  collectLogFile: boolean;

  /**
   * The variant to consider when performing installations and validating shrinkwrap updates.
   */
  variant: string | undefined;

  /**
   * Retry the install the specified number of times
   */
  maxInstallAttempts: number;

  /**
   * An array of `--filter` argument values. For example, if the array is ["a", "b"] then Rush would invoke
   * `pnpm install --filter a --filter b` which restricts the install/update to dependencies of
   * workspace projects "a" and "b". If the array is empty, then an unfiltered install
   * is performed. Filtered installs have some limitations such as less comprehensive version analysis.
   *
   * @remarks
   * Note that PNPM may arbitrarily ignore `--filter` (producing an unfiltered install) in certain situations,
   * for example when `config.dedupe-peer-dependents=true` with PNPM 8.  Rush tries to circumvent this, under the
   * assumption that a user who invokes a filtered install cares more about lockfile stability than duplication.
   */
  pnpmFilterArgumentValues: string[];

  /**
   * The set of projects for which installation should be performed.
   */
  selectedProjects: Set<RushConfigurationProject>;

  /**
   * Callback to invoke between preparing the common/temp folder and running installation.
   */
  beforeInstallAsync?: (subspace: Subspace) => Promise<void>;

  /**
   * Callback to invoke after a successful installation.
   */
  afterInstallAsync?: (subspace: Subspace) => Promise<void>;

  /**
   * The specific subspace to install.
   */
  subspace: Subspace;

  /**
   * The terminal where output should be printed.
   */
  terminal: ITerminal;
}
