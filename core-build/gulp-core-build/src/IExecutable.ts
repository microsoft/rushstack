// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IBuildConfig } from './IBuildConfig';

/**
 * @public
 */
export interface IExecutable {
  /**
   * The maximum amount of time the build can run before being terminated.
   * Specified in milliseconds. By default, there is no timeout.
   *
   * If set to zero (0), the build will never time out.
   *
   * This option overrides the maxBuildTime property on the global build config.
   */
  maxBuildTimeMs?: number;

  /**
   * Helper function which is called one time when the task is registered
   */
  onRegister?: () => void;

  /**
   * Execution method.
   */
  execute: (config: IBuildConfig) => Promise<void>;

  /**
   * Optional name to give the task. If no name is provided, the "Running subtask" logging will be silent.
   */
  name?: string;

  /**
   * Optional callback to indicate if the task is enabled or not.
   */
  isEnabled?: (buildConfig: IBuildConfig) => boolean;

  /**
   * Optional method to indicate directory matches to clean up when the clean task is run.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
}
