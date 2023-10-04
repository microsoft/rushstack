// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

/**
 * A disjoint set data structure
 */
export class DisjointSet<T extends object> {
  private _forest: Set<T>;
  private _parentMap: Map<T, T>;
  private _sizeMap: Map<T, number>;
  private _setByElement: Map<T, Set<T>> | undefined;

  public constructor() {
    this._forest = new Set<T>();
    this._parentMap = new Map<T, T>();
    this._sizeMap = new Map<T, number>();
    this._setByElement = new Map<T, Set<T>>();
  }

  public destroy(): void {
    this._forest.clear();
    this._parentMap.clear();
    this._sizeMap.clear();
    this._setByElement?.clear();
  }

  /**
   * Adds a new set containing specific object
   */
  public add(x: T): void {
    if (this._forest.has(x)) {
      return;
    }

    this._forest.add(x);
    this._parentMap.set(x, x);
    this._sizeMap.set(x, 1);
    this._setByElement = undefined;
  }

  /**
   * Unions the sets that contain two objects
   */
  public union(a: T, b: T): void {
    let x: T = this._find(a);
    let y: T = this._find(b);

    if (x === y) {
      // x and y are already in the same set
      return;
    }

    const xSize: number = this._getSize(x);
    const ySize: number = this._getSize(y);
    if (xSize < ySize) {
      const t: T = x;
      x = y;
      y = t;
    }
    this._parentMap.set(y, x);
    this._sizeMap.set(x, xSize + ySize);
    this._setByElement = undefined;
  }

  public getAllSets(): Iterable<Set<T>> {
    if (this._setByElement === undefined) {
      this._setByElement = new Map<T, Set<T>>();

      for (const element of this._forest) {
        const root: T = this._find(element);
        let set: Set<T> | undefined = this._setByElement.get(root);
        if (set === undefined) {
          set = new Set<T>();
          this._setByElement.set(root, set);
        }
        set.add(element);
      }
    }
    return this._setByElement.values();
  }

  /**
   * Returns true if x and y are in the same set
   */
  public isConnected(x: T, y: T): boolean {
    return this._find(x) === this._find(y);
  }

  private _find(a: T): T {
    let x: T = a;
    let parent: T = this._getParent(x);
    while (parent !== x) {
      parent = this._getParent(parent);
      this._parentMap.set(x, parent);
      x = parent;
      parent = this._getParent(x);
    }
    return x;
  }

  private _getParent(x: T): T {
    const parent: T | undefined = this._parentMap.get(x);
    if (parent === undefined) {
      // This should not happen
      throw new InternalError(`Can not find parent`);
    }
    return parent;
  }

  private _getSize(x: T): number {
    const size: number | undefined = this._sizeMap.get(x);
    if (size === undefined) {
      // This should not happen
      throw new InternalError(`Can not get size`);
    }
    return size;
  }
}
