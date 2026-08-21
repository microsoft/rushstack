// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

/**
 * A disjoint set data structure
 */
export class DisjointSet<T extends object> {
  #forest: Set<T>;
  #parentMap: Map<T, T>;
  #sizeMap: Map<T, number>;
  #setByElement: Map<T, Set<T>> | undefined;

  public constructor() {
    this.#forest = new Set<T>();
    this.#parentMap = new Map<T, T>();
    this.#sizeMap = new Map<T, number>();
    this.#setByElement = new Map<T, Set<T>>();
  }

  public destroy(): void {
    this.#forest.clear();
    this.#parentMap.clear();
    this.#sizeMap.clear();
    this.#setByElement?.clear();
  }

  /**
   * Adds a new set containing specific object
   */
  public add(x: T): void {
    if (this.#forest.has(x)) {
      return;
    }

    this.#forest.add(x);
    this.#parentMap.set(x, x);
    this.#sizeMap.set(x, 1);
    this.#setByElement = undefined;
  }

  /**
   * Unions the sets that contain two objects
   */
  public union(a: T, b: T): void {
    let x: T = this.#find(a);
    let y: T = this.#find(b);

    if (x === y) {
      // x and y are already in the same set
      return;
    }

    const xSize: number = this.#getSize(x);
    const ySize: number = this.#getSize(y);
    if (xSize < ySize) {
      const t: T = x;
      x = y;
      y = t;
    }
    this.#parentMap.set(y, x);
    this.#sizeMap.set(x, xSize + ySize);
    this.#setByElement = undefined;
  }

  public getAllSets(): Iterable<Set<T>> {
    if (this.#setByElement === undefined) {
      this.#setByElement = new Map<T, Set<T>>();

      for (const element of this.#forest) {
        const root: T = this.#find(element);
        let set: Set<T> | undefined = this.#setByElement.get(root);
        if (set === undefined) {
          set = new Set<T>();
          this.#setByElement.set(root, set);
        }
        set.add(element);
      }
    }
    return this.#setByElement.values();
  }

  /**
   * Returns true if x and y are in the same set
   */
  public isConnected(x: T, y: T): boolean {
    return this.#find(x) === this.#find(y);
  }

  #find(a: T): T {
    let x: T = a;
    let parent: T = this.#getParent(x);
    while (parent !== x) {
      parent = this.#getParent(parent);
      this.#parentMap.set(x, parent);
      x = parent;
      parent = this.#getParent(x);
    }
    return x;
  }

  #getParent(x: T): T {
    const parent: T | undefined = this.#parentMap.get(x);
    if (parent === undefined) {
      // This should not happen
      throw new InternalError(`Can not find parent`);
    }
    return parent;
  }

  #getSize(x: T): number {
    const size: number | undefined = this.#sizeMap.get(x);
    if (size === undefined) {
      // This should not happen
      throw new InternalError(`Can not get size`);
    }
    return size;
  }
}
