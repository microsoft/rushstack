// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IOperationRunnerContext } from './IOperationRunner';
import { OperationStatus } from './OperationStatus';

/**
 *
 * @alpha
 */
export interface IOperationProcessor {
  /**
   *
   */
  beforeBuildAsync(context: IOperationRunnerContext): Promise<OperationStatus>;
  /**
   *
   */
  afterBuildAsync(context: IOperationRunnerContext, status: OperationStatus): Promise<OperationStatus>;
}
