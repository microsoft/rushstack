// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TscCmdTask, ITscCmdTaskConfig } from './TscCmdTask';
import { LintCmdTask, ILintCmdTaskConfig } from './LintCmdTask';
import { TslintCmdTask, ITslintCmdTaskConfig } from './TslintCmdTask';
import { ApiExtractorTask } from './ApiExtractorTask';

export {
  TscCmdTask,
  ITscCmdTaskConfig,
  TslintCmdTask,
  ITslintCmdTaskConfig,
  LintCmdTask,
  ILintCmdTaskConfig
};

/** @public */
export const tscCmd: TscCmdTask = new TscCmdTask();

/** @public */
export const tslintCmd: TslintCmdTask = new TslintCmdTask();

/** @public */
export const lintCmd: LintCmdTask = new LintCmdTask();

/** @public */
export const apiExtractor: ApiExtractorTask = new ApiExtractorTask();
