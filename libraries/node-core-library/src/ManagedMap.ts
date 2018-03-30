// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ManagedMapView, IManagedMapController } from './ManagedMapView';

/**
 * Constructor parameters for {@link ManagedMap}
 *
 * @public
 */
export interface IManagedMapParameters<K, V> {
  /**
   * An optional hook that will be invoked before Map.clear() is performed.
   */
  onClear?: (source: ManagedMap<K, V>) => void;

  /**
   * An optional hook that will be invoked before Map.delete() is performed.
   */
  onDelete?: (source: ManagedMap<K, V>, key: K) => void;

  /**
   * An optional hook that will be invoked before Map.onSet() is performed.
   */
  onSet?: (source: ManagedMap<K, V>, key: K, value: V) => void;
}

/**
 * The ManagedMap provides an easy way for an API to expose a Map<K, V> view
 * while intercepting and validating any write operations that are performed on it.
 *
 * @remarks
 * The ManagedMap itself is intended to be a private object maintained by its
 * owner, and allows write operations to be performed without any validation.
 * The {@link ManagedMap.view} property is the validated view, and should be
 * exposed to API consumers.
 *
 * For example, suppose you want to share your Map<string,number> data structure,
 * but you want to enforce that the key must always be an upper case string:
 * You could use the onSet() method to check the keys and throw an exception
 * if the key is invalid.
 *
 * @public
 */
export class ManagedMap<K, V> {
  private readonly _view: ManagedMapView<K, V>;
  private _controller: IManagedMapController<K, V>;

  public constructor(parameters: IManagedMapParameters<K, V>) {
    this._view = new ManagedMapView<K, V>(this, {
      ...parameters,
      onBindController: (controller: IManagedMapController<K, V>) => {
        this._controller = controller;
      }
    });
  }

  /**
   * The owner of the managed map should return this object via its public API.
   */
  public get view(): Map<K, V> {
    return this._view;
  }

  // ---------------------------------------------------------------------------
  // lib.es2015.collections contract - write operations

  public clear(): void {
    this._controller.clear();
  }

  public delete(key: K): boolean {
    return this._controller.delete(key);
  }

  public set(key: K, value: V): this {
    this._controller.set(key, value);
    return this;
  }

  // ---------------------------------------------------------------------------
  // lib.es2015.collections contract - read operations

  // tslint:disable-next-line:no-any
  public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this._view.forEach(callbackfn);
  }

  public get(key: K): V | undefined {
    return this._view.get(key);
  }

  public has(key: K): boolean {
    return this._view.has(key);
  }

  public get size(): number {
    return this._view.size;
  }
}
