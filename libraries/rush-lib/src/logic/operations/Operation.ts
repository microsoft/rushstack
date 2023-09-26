// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { IOperationRunner } from './IOperationRunner';

/**
 * Options for constructing a new Operation.
 * @alpha
 */
export interface IOperationOptions {
  /**
   * The Rush phase associated with this Operation, if any
   */
  phase?: IPhase | undefined;
  /**
   * The Rush project associated with this Operation, if any
   */
  project?: RushConfigurationProject | undefined;
  /**
   * When the scheduler is ready to process this `Operation`, the `runner` implements the actual work of
   * running the operation.
   */
  runner?: IOperationRunner | undefined;
}

/**
 * The `Operation` class is a node in the dependency graph of work that needs to be scheduled by the
 * `OperationExecutionManager`. Each `Operation` has a `runner` member of type `IOperationRunner`, whose
 * implementation manages the actual process of running a single operation.
 *
 * The graph of `Operation` instances will be cloned into a separate execution graph after processing.
 *
 * @alpha
 */
export class Operation {
  /**
   * The Rush phase associated with this Operation, if any
   */
  public readonly associatedPhase: IPhase | undefined;

  /**
   * The Rush project associated with this Operation, if any
   */
  public readonly associatedProject: RushConfigurationProject | undefined;

  /**
   * A set of all operations which depend on this operation.
   */
  public readonly consumers: ReadonlySet<Operation> = new Set<Operation>();

  /**
   * A set of all dependencies which must be executed before this operation is complete.
   */
  public readonly dependencies: ReadonlySet<Operation> = new Set<Operation>();

  /**
   * When the scheduler is ready to process this `Operation`, the `runner` implements the actual work of
   * running the operation.
   */
  public runner: IOperationRunner | undefined = undefined;

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

  public constructor(options?: IOperationOptions) {
    this.associatedPhase = options?.phase;
    this.associatedProject = options?.project;
    this.runner = options?.runner;
  }

  /**
   * The name of this operation, for logging.
   */
  public get name(): string | undefined {
    return this.runner?.name;
  }

  /**
   * Adds the specified operation as a dependency and updates the consumer list.
   */
  public addDependency(dependency: Operation): void {
    // Cast internally to avoid adding the overhead of getters
    (this.dependencies as Set<Operation>).add(dependency);
    (dependency.consumers as Set<Operation>).add(this);
  }

  /**
   * Deletes the specified operation as a dependency and updates the consumer list.
   */
  public deleteDependency(dependency: Operation): void {
    // Cast internally to avoid adding the overhead of getters
    (this.dependencies as Set<Operation>).delete(dependency);
    (dependency.consumers as Set<Operation>).delete(this);
  }
}
