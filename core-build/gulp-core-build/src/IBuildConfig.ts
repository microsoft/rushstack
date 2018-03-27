// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as gulp from 'gulp';
import { GulpProxy } from './GulpProxy';
import { IExecutable } from './IExecutable';

/* tslint:disable:no-any */

/**
 * @public
 */
export interface IBuildConfig {
  /**
   * Proxy gulp instance.
   */
  gulp: GulpProxy | gulp.Gulp;

  /**
   * Array of all unique tasks.
   */
  uniqueTasks?: IExecutable[];

  /**
   * Full physical path to the root path directory.
   */
  rootPath: string;

  /**
   * Package output folder in which publishable output should be dropped.
   * Defaults to package.json directories/packagePath value.
   */
  packageFolder: string;

  /**
   * Source folder name where source is included.
   */
  srcFolder: string;

  /**
   * Unbundled commonjs modules folder, which will be referenced by other node projects.
   */
  libFolder: string;

  /**
   * Unbundled amd modules folder, which can be optionally set to cause build tasks to
   * output AMD modules if required for legacy reasons.
   */
  libAMDFolder?: string;

  /**
   * Unbundled es6 modules folder, which can be optionally set to cause build tasks to output es6 modules.
   */
  libES6Folder?: string;

  /**
   * Unbundled esnext modules folder, which can be optionally set to cause build tasks to output esnext modules.
   */
  libESNextFolder?: string;

  /**
   * Dist folder, which includes all bundled resources which would be copied to a CDN for the project.
   */
  distFolder: string;

  /**
   * Temp folder for storing temporary files.
   */
  tempFolder: string;

  /**
   * Re-log known issues after the build is complete.
   */
  relogIssues?: boolean;

  /**
   * Show toast on build failures and recoveries.
   */
  showToast?: boolean;

  /**
   * Path to icon shown in toast on a successful build recovery.
   */
  buildSuccessIconPath?: string;

  /**
   * Path to icon shown in toast on a build error.
   */
  buildErrorIconPath?: string;

  /**
   * Use verbose logging.
   */
  verbose: boolean;

  /**
   * Build a full production build.
   */
  production: boolean;

  /**
   * Should warnings be written to STDERR and cause build to return non-zero exit code
   */
  shouldWarningsFailBuild: boolean;

  /**
   * Arguments passed in.
   */
  args: { [name: string]: string | boolean };

  /**
   * Arbitrary property bag for a task to store environment values in.
   */
  properties?: { [key: string]: any };

  /**
   * Optional callback to be executed when a task starts.
   */
  onTaskStart?: (taskName: string) => void;

  /**
   * Optional callback to be executed when a task ends.
   */
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;

  /**
   * Flag used to indicate if the build is redundant and should be exited prematurely.
   */
  isRedundantBuild?: boolean;

  /**
   * Flag to indicate whether Jest is enabled.
   * If Jest is enabled, mocha and Karma are disabled.
   */
  jestEnabled?: boolean;
}
