// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ProtectableMap, IProtectableMapParameters } from './ProtectableMap.ts';

/**
 * The internal wrapper used by ProtectableMap.  It extends the real `Map<K, V>` base class,
 * but hooks the destructive operations (clear/delete/set) to give the owner a chance
 * to block them.
 *
 * NOTE: This is not a public API.
 */
export class ProtectableMapView<K, V> extends Map<K, V> {
  private readonly _owner: ProtectableMap<K, V>;
  private readonly _parameters: IProtectableMapParameters<K, V>;

  public constructor(owner: ProtectableMap<K, V>, parameters: IProtectableMapParameters<K, V>) {
    super();

    this._owner = owner;
    this._parameters = parameters;
  }

  public override clear(): void {
    if (this._parameters.onClear) {
      this._parameters.onClear(this._owner);
    }
    super.clear();
  }

  public override delete(key: K): boolean {
    if (this._parameters.onDelete) {
      this._parameters.onDelete(this._owner, key);
    }
    return super.delete(key);
  }

  public override set(key: K, value: V): this {
    let modifiedValue: V = value;
    if (this._parameters.onSet) {
      modifiedValue = this._parameters.onSet(this._owner, key, modifiedValue);
    }
    super.set(key, modifiedValue);
    return this;
  }

  // INTERNAL USAGE ONLY
  public _clearUnprotected(): void {
    super.clear();
  }

  // INTERNAL USAGE ONLY
  public _deleteUnprotected(key: K): boolean {
    return super.delete(key);
  }

  // INTERNAL USAGE ONLY
  public _setUnprotected(key: K, value: V): void {
    super.set(key, value);
  }
}
