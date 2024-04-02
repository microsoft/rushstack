// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type { Subspace } from '../../api/Subspace';

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
   * Retry the install the specified number of times
   */
  maxInstallAttempts: number;

  /**
   * Filters to be passed to PNPM during installation, if applicable.
   * These restrict the scope of a workspace installation.
   */
  pnpmFilterArguments: string[];

  /**
   * Callback to invoke between preparing the common/temp folder and running installation.
   */
  beforeInstallAsync?: () => Promise<void>;

  /**
   * The specific subspace to install.
   */
  subspace: Subspace;

  /**
   * The terminal where output should be printed.
   */
  terminal: ITerminal;
}
