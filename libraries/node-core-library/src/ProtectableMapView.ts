// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ManagedMap, IManagedMapParameters } from './ManagedMap';

/**
 * Operations that only the owner of the ManagedMapView can perform on the view.
 */
export interface IManagedMapController<K, V> {
  clear(): void;
  delete(key: K): boolean;
  set(key: K, value: V): void;
}

/**
 * Constructor parameters for ManagedMapView
 *
 * NOTE: This is not a public API.
 */
export interface IManagedMapViewParameters<K, V> extends IManagedMapParameters<K, V> {
  onBindController(operations: IManagedMapController<K, V>): void;
}

/**
 * The internal wrapper used by ManagedMap.  It extends the real Map<K, V> base class,
 * but hooks the destructive operations (clear/delete/set) to give the manager a chance
 * to block them.
 *
 * NOTE: This is not a public API.
 */
export class ManagedMapView<K, V> extends Map<K, V> {
  private readonly _owner: ManagedMap<K, V>;
  private readonly _parameters: IManagedMapViewParameters<K, V>;

  constructor(owner: ManagedMap<K, V>, parameters: IManagedMapViewParameters<K, V>) {
    super();

    this._owner = owner;
    this._parameters = parameters;

    // The controller interface allows the owner to bypass the wrapper
    // perform operations without triggering the normal event callbacks
    parameters.onBindController({
      clear: () => super.clear(),
      delete: (key: K) => super.delete(key),
      set: (key: K, value: V) => super.set(key, value)
    });
  }

  public clear(): void { // override
    if (this._parameters.onClear) {
      this._parameters.onClear(this._owner);
    }
    super.clear();
  }

  public delete(key: K): boolean { // override
    if (this._parameters.onDelete) {
      this._parameters.onDelete(this._owner, key);
    }
    return super.delete(key);
  }

  public set(key: K, value: V): this { // override
    let modifiedValue: V = value;
    if (this._parameters.onSet) {
      modifiedValue = this._parameters.onSet(this._owner, key, modifiedValue);
    }
    super.set(key, modifiedValue);
    return this;
  }
}
