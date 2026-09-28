// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationExecutionResult, Operation } from '@microsoft/rush-lib';

import type { IRequestEventSink } from './PhasedRequestEventMultiplexer';
import { TERMINAL_OPERATION_STATUSES } from './PhasedRequestEventSink';

/**
 * Tracks whether the unfinished work of a shared iteration is still needed by one of the batch's remaining clients.
 *
 * @remarks
 * A batch arms the tracker when a participating client leaves (cancellation or output failure) while other
 * participants remain. From then on, the tracker reports the iteration as abandoned, exactly once, as soon as every
 * operation that a remaining client needs has reached a terminal status while enabled operations that only departed
 * clients needed are still unfinished. Disabled operations finish without running anything, so they alone never
 * make an iteration abandoned.
 *
 * The tracker observes status changes rather than completion events: the graph dispatches an operation's dependents
 * before that operation's completion event, so aborting on completion could start a process only to terminate it.
 */
export class PhasedIterationDemand implements IRequestEventSink {
  readonly #onAbandoned: () => void;
  readonly #unfinished: Set<IOperationExecutionResult> = new Set();
  #abandoned: boolean = false;
  #needed: ReadonlySet<Operation> | undefined;
  #neededUnfinished: number = 0;

  public constructor(onAbandoned: () => void) {
    this.#onAbandoned = onAbandoned;
  }

  /** Whether the iteration was reported as abandoned. */
  public get abandoned(): boolean {
    return this.#abandoned;
  }

  /**
   * Arms the tracker with, or narrows it to, the operations that the remaining clients still need.
   */
  public restrictTo(neededOperations: Iterable<Operation>): void {
    this.#needed = new Set(neededOperations);
    this.#countNeededUnfinished();
    this.#evaluate();
  }

  public onIterationScheduled(records: Iterable<IOperationExecutionResult>): void {
    this.#unfinished.clear();
    for (const record of records) {
      if (!TERMINAL_OPERATION_STATUSES.has(record.status)) {
        this.#unfinished.add(record);
      }
    }
    this.#countNeededUnfinished();
    this.#evaluate();
  }

  public onOperationStatusChanged(record: IOperationExecutionResult): void {
    if (!TERMINAL_OPERATION_STATUSES.has(record.status) || !this.#unfinished.delete(record)) {
      return;
    }
    if (this.#needed?.has(record.operation)) {
      this.#neededUnfinished--;
      this.#evaluate();
    }
  }

  #countNeededUnfinished(): void {
    let neededUnfinished: number = 0;
    if (this.#needed) {
      for (const record of this.#unfinished) {
        if (this.#needed.has(record.operation)) {
          neededUnfinished++;
        }
      }
    }
    this.#neededUnfinished = neededUnfinished;
  }

  #evaluate(): void {
    if (this.#abandoned || !this.#needed || this.#neededUnfinished > 0) {
      return;
    }
    // Every unfinished operation is now one that no remaining client needs.
    for (const record of this.#unfinished) {
      if (record.enabled) {
        this.#abandoned = true;
        this.#onAbandoned();
        return;
      }
    }
  }
}
