// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Implements a standard heap data structure for items of type T and a custom comparator.
 * The root will always be the minimum value as determined by the comparator.
 *
 * @public
 */
export class MinimumHeap<T> {
  private readonly _items: T[] = [];
  private readonly _comparator: (a: T, b: T) => number;

  /**
   * Constructs a new MinimumHeap instance.
   * @param comparator - a comparator function that determines the order of the items in the heap.
   *   If the comparator returns a value less than zero, then `a` will be considered less than `b`.
   *   If the comparator returns zero, then `a` and `b` are considered equal.
   *   Otherwise, `a` will be considered greater than `b`.
   */
  public constructor(comparator: (a: T, b: T) => number) {
    this._comparator = comparator;
  }

  /**
   * Returns the number of items in the heap.
   * @returns the number of items in the heap.
   */
  public get size(): number {
    return this._items.length;
  }

  /**
   * Retrieves the root item from the heap without removing it.
   * @returns the root item, or `undefined` if the heap is empty
   */
  public peek(): T | undefined {
    return this._items[0];
  }

  /**
   * Retrieves and removes the root item from the heap. The next smallest item will become the new root.
   * @returns the root item, or `undefined` if the heap is empty
   */
  public poll(): T | undefined {
    if (this.size > 0) {
      const result: T = this._items[0];
      const item: T = this._items.pop()!;

      const size: number = this.size;
      if (size === 0) {
        // Short circuit in the trivial case
        return result;
      }

      let index: number = 0;

      let smallerChildIndex: number = 1;

      while (smallerChildIndex < size) {
        let smallerChild: T = this._items[smallerChildIndex];

        const rightChildIndex: number = smallerChildIndex + 1;

        if (rightChildIndex < size) {
          const rightChild: T = this._items[rightChildIndex];
          if (this._comparator(rightChild, smallerChild) < 0) {
            smallerChildIndex = rightChildIndex;
            smallerChild = rightChild;
          }
        }

        if (this._comparator(smallerChild, item) < 0) {
          this._items[index] = smallerChild;
          index = smallerChildIndex;
          smallerChildIndex = index * 2 + 1;
        } else {
          break;
        }
      }

      // Place the item in its final location satisfying the heap property
      this._items[index] = item;

      return result;
    }
  }

  /**
   * Pushes an item into the heap.
   * @param item - the item to push
   */
  public push(item: T): void {
    let index: number = this.size;
    while (index > 0) {
      // Due to zero-based indexing the parent is not exactly a bit shift
      const parentIndex: number = ((index + 1) >> 1) - 1;
      const parent: T = this._items[parentIndex];
      if (this._comparator(item, parent) < 0) {
        this._items[index] = parent;
        index = parentIndex;
      } else {
        break;
      }
    }
    this._items[index] = item;
  }
}
