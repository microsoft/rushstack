// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IOperationRunner } from './IOperationRunner';

/**
 * The `Operation` class is a node in the dependency graph of work that needs to be scheduled by the
 * `OperationExecutionManager`. Each `Operation` has a `runner` member of type `IOperationRunner`, whose
 * implementation manages the actual process of running a single operation.
 *
 * The graph of `Operation` instances will be cloned into a separate execution graph after processing.
 *
 * @beta
 */
export class Operation {
  /**
   * When the scheduler is ready to process this `Operation`, the `runner` implements the actual work of
   * running the operation.
   */
  public runner: IOperationRunner;

  /**
   * A set of all dependencies which must be executed before this operation is complete.
   */
  public readonly dependencies: Set<Operation> = new Set<Operation>();

  /**
   * The weight for this operation. This scalar is the contribution of this operation to the
   * `criticalPathLength` calculation above. Modify to indicate the following:
   * - `weight` === 1: indicates that this operation has an average duration
   * - `weight` &gt; 1: indicates that this operation takes longer than average and so the scheduler
   *     should try to favor starting it over other, shorter operations. An example might be an operation that
   *     bundles an entire application and runs whole-program optimization.
   * - `weight` &lt; 1: indicates that this operation takes less time than average and so the scheduler
   *     should favor other, longer operations over it. An example might be an operation to unpack a cached
   *     output, or an operation using NullOperationRunner, which might use a value of 0.
   */
  public weight: number = 1;

  public constructor(runner: IOperationRunner) {
    this.runner = runner;
  }

  public get name(): string {
    return this.runner.name;
  }
}
