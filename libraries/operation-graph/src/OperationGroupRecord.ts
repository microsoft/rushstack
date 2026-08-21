// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

import type { IOperationState } from './IOperationRunner';
import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { Stopwatch } from './Stopwatch';

/**
 * Meta-entity that tracks information about a group of related operations.
 *
 * @beta
 */
export class OperationGroupRecord<TMetadata extends {} = {}> {
  readonly #operations: Set<Operation> = new Set();
  #remainingOperations: Set<Operation> = new Set();

  #groupStopwatch: Stopwatch = new Stopwatch();
  #hasCancellations: boolean = false;
  #hasFailures: boolean = false;

  public readonly name: string;
  public readonly metadata: TMetadata;

  public get duration(): number {
    return this.#groupStopwatch ? this.#groupStopwatch.duration : 0;
  }

  public get finished(): boolean {
    return this.#remainingOperations.size === 0;
  }

  public get hasCancellations(): boolean {
    return this.#hasCancellations;
  }

  public get hasFailures(): boolean {
    return this.#hasFailures;
  }

  public constructor(name: string, metadata: TMetadata = {} as TMetadata) {
    this.name = name;
    this.metadata = metadata;
  }

  public addOperation(operation: Operation): void {
    this.#operations.add(operation);
  }

  public startTimer(): void {
    // Keep this undefined until needed, then start to avoid subsequent calls to startTimer()
    this.#groupStopwatch.start();
  }

  public setOperationAsComplete(operation: Operation, state: IOperationState): void {
    if (!this.#remainingOperations.has(operation)) {
      throw new InternalError(`Operation ${operation.name} is not in the group ${this.name}`);
    }

    if (state.status === OperationStatus.Aborted) {
      this.#hasCancellations = true;
    } else if (state.status === OperationStatus.Failure) {
      this.#hasFailures = true;
    }

    this.#remainingOperations.delete(operation);
    if (this.#remainingOperations.size === 0) {
      this.#groupStopwatch.stop();
    }
  }

  public reset(): void {
    this.#remainingOperations = new Set(this.#operations);
    this.#groupStopwatch.reset();
    this.#hasCancellations = false;
    this.#hasFailures = false;
  }
}
