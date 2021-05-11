// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ILintRunnerConfig } from './ILintRunnerConfig';
import { RushStackCompilerBase } from './RushStackCompilerBase';

/**
 * @public
 */
export interface ITslintRunnerConfig extends ILintRunnerConfig {}

/**
 * @beta
 */
export class TslintRunner extends RushStackCompilerBase<ITslintRunnerConfig> {
  public invoke(): Promise<void> {
    throw new Error('TSLint is not supported for rush-stack-compiler-4.X packages.');
  }
}
