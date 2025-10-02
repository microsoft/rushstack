// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import process from 'node:process';
import { InternalError } from './InternalError';

/**
 * A process environment variable name and its value.  Used by {@link EnvironmentMap}.
 * @public
 */
export interface IEnvironmentEntry {
  /**
   * The name of the environment variable.
   */
  name: string;

  /**
   * The value of the environment variable.
   */
  value: string;
}

/**
 * A map data structure that stores process environment variables.  On Windows
 * operating system, the variable names are case-insensitive.
 * @public
 */
export class EnvironmentMap {
  private readonly _map: Map<string, IEnvironmentEntry> = new Map();

  /**
   * Whether the environment variable names are case-sensitive.
   *
   * @remarks
   * On Windows operating system, environment variables are case-insensitive.
   * The map will preserve the variable name casing from the most recent assignment operation.
   */
  public readonly caseSensitive: boolean;

  public constructor(environmentObject: Record<string, string | undefined> = {}) {
    // This property helps catch a mistake where an instance of `EnvironmentMap` is accidentally passed to
    // a function that expects a `Record<string, string>` (as would be used with the `process.env` API).
    // The property getter will throw an exception if that function tries to enumerate the object values.
    Object.defineProperty(this, '_sanityCheck', {
      enumerable: true,
      get: function () {
        throw new InternalError('Attempt to read EnvironmentMap class as an object');
      }
    });

    this.caseSensitive = process.platform !== 'win32';
    this.mergeFromObject(environmentObject);
  }

  /**
   * Clears all entries, resulting in an empty map.
   */
  public clear(): void {
    this._map.clear();
  }

  /**
   * Assigns the variable to the specified value.  A previous value will be overwritten.
   *
   * @remarks
   * The value can be an empty string.  To completely remove the entry, use
   * {@link EnvironmentMap.unset} instead.
   */
  public set(name: string, value: string): void {
    const key: string = this.caseSensitive ? name : name.toUpperCase();
    this._map.set(key, { name: name, value });
  }

  /**
   * Removes the key from the map, if present.
   */
  public unset(name: string): void {
    const key: string = this.caseSensitive ? name : name.toUpperCase();
    this._map.delete(key);
  }

  /**
   * Returns the value of the specified variable, or `undefined` if the map does not contain that name.
   */
  public get(name: string): string | undefined {
    const key: string = this.caseSensitive ? name : name.toUpperCase();
    const entry: IEnvironmentEntry | undefined = this._map.get(key);
    if (entry === undefined) {
      return undefined;
    }
    return entry.value;
  }

  /**
   * Returns the map keys, which are environment variable names.
   */
  public names(): IterableIterator<string> {
    return this._map.keys();
  }

  /**
   * Returns the map entries.
   */
  public entries(): IterableIterator<IEnvironmentEntry> {
    return this._map.values();
  }

  /**
   * Adds each entry from `environmentMap` to this map.
   */
  public mergeFrom(environmentMap: EnvironmentMap): void {
    for (const entry of environmentMap.entries()) {
      this.set(entry.name, entry.value);
    }
  }

  /**
   * Merges entries from a plain JavaScript object, such as would be used with the `process.env` API.
   */
  public mergeFromObject(environmentObject: Record<string, string | undefined> = {}): void {
    for (const [name, value] of Object.entries(environmentObject)) {
      if (value !== undefined) {
        this.set(name, value);
      }
    }
  }

  /**
   * Returns the keys as a plain JavaScript object similar to the object returned by the `process.env` API.
   */
  public toObject(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const entry of this.entries()) {
      result[entry.name] = entry.value;
    }
    return result;
  }
}
