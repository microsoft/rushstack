// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { IPhase } from '../../api/CommandLineConfiguration';
import { IOperationProcessor } from './IOperationProcessor';
import { IOperationRunner } from './IOperationRunner';
import { IProjectFileFilter } from '../ProjectChangeAnalyzer';
import { RushConstants } from '../RushConstants';

/**
 * Options for constructing a new Operation.
 * @alpha
 */
export interface IOperationOptions {
  /**
   * The Rush phase associated with this Operation, if any
   */
  phase: IPhase;
  /**
   * The Rush project associated with this Operation, if any
   */
  project: RushConfigurationProject;
  /**
   * When the scheduler is ready to process this `Operation`, the `runner` implements the actual work of
   * running the operation.
   */
  runner?: IOperationRunner | undefined;
  /**
   * For use by incremental skip and the build cache, the list of output folders
   */
  outputFolderNames?: ReadonlyArray<string> | undefined;
  /**
   * For use by incremental skip and the build cache, a function to filter tracked files
   */
  projectFileFilter?: IProjectFileFilter | undefined;
  /**
   * Operator to do pre/post build operations
   */
  processor?: IOperationProcessor | undefined;
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
  public readonly associatedPhase: IPhase;

  /**
   * The Rush project associated with this Operation, if any
   */
  public readonly associatedProject: RushConfigurationProject;

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
  public runner: IOperationRunner | undefined;

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

  public readonly outputFolderNames: ReadonlyArray<string>;

  public readonly projectFileFilter: IProjectFileFilter | undefined;

  public processor: IOperationProcessor | undefined;

  public logFilePath: string | undefined = undefined;

  public constructor(options: IOperationOptions) {
    const {
      phase,
      outputFolderNames = []
    } = options;

    this.associatedPhase = phase;
    this.associatedProject = options.project;

    const uniqueOutputFolderNames: Set<string> = new Set(outputFolderNames);
    uniqueOutputFolderNames.add(
      `${RushConstants.projectRushFolderName}/${RushConstants.rushTempFolderName}/operation/${phase.logFilenameIdentifier}`);
    const sortedOutputFolderNames: string[] = Array.from(uniqueOutputFolderNames).sort();
    this.outputFolderNames = sortedOutputFolderNames;

    this.projectFileFilter = options.projectFileFilter;

    this.runner = options.runner;
    this.processor = options.processor;
  }

  /**
   * The name of this operation, for logging.
   */
  public get name(): string | undefined {
    return this.runner?.name;
  }

  /**
   * Computes this operation's input state hash, for use by the caching layer.
   * @param localHash - The hash of the local file inputs for this operation
   * @param dependencyHashes - The state hashes of this operation's dependencies
   */
  public getHash(localHash: string, dependencyHashes: string[]): string {
    if (!localHash) {
      return '';
    }

    for (const dependencyHash of dependencyHashes) {
      if (!dependencyHash) {
        return '';
      }
    }

    const hash: crypto.Hash = crypto.createHash('sha1');
    hash.update(`${RushConstants.buildCacheVersion}`);
    hash.update(RushConstants.hashDelimiter);

    // Output folder names are part of the configuration, so include in hash
    for (const outputFolder of this.outputFolderNames) {
      hash.update(outputFolder);
      hash.update(RushConstants.hashDelimiter);
    }

    // CLI parameters that apply to the phase affect the result
    const params: string[] = [];
    for (const tsCommandLineParameter of this.associatedPhase.associatedParameters) {
      tsCommandLineParameter.appendToArgList(params);
    }
    hash.update(params.join(' '));

    hash.update(localHash);

    const sortedHashes: string[] = dependencyHashes.sort();
    for (const dependencyHash of sortedHashes) {
      hash.update(dependencyHash);
      hash.update(RushConstants.hashDelimiter);
    }
    return hash.digest('hex');
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
