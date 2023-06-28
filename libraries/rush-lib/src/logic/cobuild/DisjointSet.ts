// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

/**
 * A disjoint set data structure
 */
export class DisjointSet<T extends object> {
  private _forest: WeakSet<T>;
  private _parentMap: WeakMap<T, T>;
  private _sizeMap: WeakMap<T, number>;

  public constructor() {
    this._forest = new WeakSet<T>();
    this._parentMap = new WeakMap<T, T>();
    this._sizeMap = new WeakMap<T, number>();
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

    if (this._getSize(x) < this._getSize(y)) {
      const t: T = x;
      x = y;
      y = t;
    }
    this._parentMap.set(y, x);
    this._sizeMap.set(x, this._getSize(x) + this._getSize(y));
  }

  /**
   * Returns true if x and y are in the same set
   */
  public isConnected(x: T, y: T): boolean {
    return this._find(x) === this._find(y);
  }

  private _find(a: T): T {
    let x: T = a;
    while (this._getParent(x) !== x) {
      this._parentMap.set(x, this._getParent(this._getParent(x)));
      x = this._getParent(x);
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
