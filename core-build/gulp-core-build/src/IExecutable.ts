// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IBuildConfig } from './IBuildConfig';

/**
 * @public
 */
export interface IExecutable {
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
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[] /* tslint:disable-line:no-any */;
}
