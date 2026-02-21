// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProtectableMapView } from './ProtectableMapView.ts';

/**
 * Constructor parameters for {@link ProtectableMap}
 *
 * @public
 */
export interface IProtectableMapParameters<K, V> {
  /**
   * An optional hook that will be invoked before Map.clear() is performed.
   */
  onClear?: (source: ProtectableMap<K, V>) => void;

  /**
   * An optional hook that will be invoked before Map.delete() is performed.
   */
  onDelete?: (source: ProtectableMap<K, V>, key: K) => void;

  /**
   * An optional hook that will be invoked before Map.set() is performed.
   * @remarks
   * If this hook is provided, the function MUST return the `value` parameter.
   * This provides the opportunity to modify the value before it is added
   * to the map.
   */
  onSet?: (source: ProtectableMap<K, V>, key: K, value: V) => V;
}

/**
 * The ProtectableMap provides an easy way for an API to expose a `Map<K, V>` property
 * while intercepting and validating any write operations that are performed by
 * consumers of the API.
 *
 * @remarks
 * The ProtectableMap itself is intended to be a private object that only its owner
 * can access directly.  Any operations performed directly on the ProtectableMap will
 * bypass the hooks and any validation they perform.  The public property that is exposed
 * to API consumers should return {@link ProtectableMap.protectedView} instead.
 *
 * For example, suppose you want to share your `Map<string, number>` data structure,
 * but you want to enforce that the key must always be an upper case string:
 * You could use the onSet() hook to validate the keys and throw an exception
 * if the key is not uppercase.
 *
 * @public
 */
export class ProtectableMap<K, V> {
  private readonly _protectedView: ProtectableMapView<K, V>;

  public constructor(parameters: IProtectableMapParameters<K, V>) {
    this._protectedView = new ProtectableMapView<K, V>(this, parameters);
  }

  /**
   * The owner of the protectable map should return this object via its public API.
   */
  public get protectedView(): Map<K, V> {
    return this._protectedView;
  }

  // ---------------------------------------------------------------------------
  // lib.es2015.collections contract - write operations

  /**
   * Removes all entries from the map.
   * This operation does NOT invoke the ProtectableMap onClear() hook.
   */
  public clear(): void {
    this._protectedView._clearUnprotected();
  }

  /**
   * Removes the specified key from the map.
   * This operation does NOT invoke the ProtectableMap onDelete() hook.
   */
  public delete(key: K): boolean {
    return this._protectedView._deleteUnprotected(key);
  }

  /**
   * Sets a value for the specified key.
   * This operation does NOT invoke the ProtectableMap onSet() hook.
   */
  public set(key: K, value: V): this {
    this._protectedView._setUnprotected(key, value);
    return this;
  }

  // ---------------------------------------------------------------------------
  // lib.es2015.collections contract - read operations

  /**
   * Performs an operation for each (key, value) entries in the map.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this._protectedView.forEach(callbackfn);
  }

  /**
   * Retrieves the value for the specified key.
   * @returns undefined if the value is undefined OR if the key is missing;
   * otherwise returns the value associated with the key.
   */
  public get(key: K): V | undefined {
    return this._protectedView.get(key);
  }

  /**
   * Returns true if the specified key belongs to the map.
   */
  public has(key: K): boolean {
    return this._protectedView.has(key);
  }

  /**
   * Returns the number of (key, value) entries in the map.
   */
  public get size(): number {
    return this._protectedView.size;
  }
}
