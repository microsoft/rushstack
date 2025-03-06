// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class AsyncQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private readonly _queue: Set<T>;
  private _finishing: boolean;
  private readonly _pendingIterators: ((result: IteratorResult<T>) => void)[];

  public constructor() {
    this._finishing = false;
    this._queue = new Set();
    this._pendingIterators = [];
  }

  public finish(): void {
    this._finishing = true;
    if (this._queue.size === 0) {
      // Queue is empty, flush
      for (const resolveAsyncIterator of this._pendingIterators.splice(0)) {
        resolveAsyncIterator({
          value: undefined,
          done: true
        });
      }
    }
  }

  public push(operation: T): void {
    if (this._finishing) {
      throw new Error(`Cannot push to the queue after finish() has been called.`);
    }

    const { _pendingIterators: waitingIterators } = this;
    if (waitingIterators.length > 0) {
      waitingIterators.shift()!({
        value: operation,
        done: false
      });
    } else {
      this._queue.add(operation);
    }
  }

  public next(): Promise<IteratorResult<T>> {
    const { _pendingIterators: waitingIterators } = this;

    const promise: Promise<IteratorResult<T>> = new Promise(
      (resolve: (result: IteratorResult<T>) => void) => {
        waitingIterators.push(resolve);
      }
    );

    this.assignOperations();

    return promise;
  }

  /**
   * Routes ready operations with 0 dependencies to waiting iterators. Normally invoked as part of `next()`, but
   * if the caller does not update operation dependencies prior to calling `next()`, may need to be invoked manually.
   */
  public assignOperations(): void {
    const { _queue: queue, _pendingIterators: waitingIterators } = this;

    // By iterating in reverse order we do less array shuffling when removing operations
    for (const operation of queue) {
      if (waitingIterators.length < 1) {
        return;
      }

      queue.delete(operation);
      waitingIterators.shift()!({
        value: operation,
        done: false
      });
    }

    if (this._finishing && queue.size === 0) {
      // Queue is empty, flush
      for (const resolveAsyncIterator of waitingIterators.splice(0)) {
        resolveAsyncIterator({
          value: undefined,
          done: true
        });
      }
    }
  }

  /**
   * Returns this queue as an async iterator, such that multiple functions iterating this object concurrently
   * receive distinct iteration results.
   */
  public [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}
