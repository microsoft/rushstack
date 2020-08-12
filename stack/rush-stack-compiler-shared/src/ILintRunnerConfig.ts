// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IRushStackCompilerBaseOptions } from './RushStackCompilerBase';

/**
 * @public
 */
export interface ILintRunnerConfig extends IRushStackCompilerBaseOptions {
  /**
   * If true, displays warnings as errors. Defaults to false.
   */
  displayAsError?: boolean;
}
