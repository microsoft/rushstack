// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TscCmdTask,
  ITscCmdTaskConfig
} from './TscCmdTask';
import {
  TslintCmdTask,
  ITslintCmdTaskConfig
} from './TslintCmdTask';
import { ApiExtractorTask } from './ApiExtractorTask';

export {
  TscCmdTask,
  ITscCmdTaskConfig,
  TslintCmdTask,
  ITslintCmdTaskConfig
};

export const tscCmd: TscCmdTask = new TscCmdTask();
export const tslintCmd: TslintCmdTask = new TslintCmdTask();
export const apiExtractor: ApiExtractorTask = new ApiExtractorTask();
