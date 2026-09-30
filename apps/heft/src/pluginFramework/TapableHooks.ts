// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { AsyncParallelHook, AsyncSeriesWaterfallHook, SyncHook } from 'tapable';

// Loading the "tapable" package index requires every hook implementation, and Heft only needs these three.
// The individual modules are the same files that the package index re-exports, so the classes are
// identical to the ones obtained via `import { SyncHook } from 'tapable'`.
let _syncHookClass: typeof SyncHook | undefined;
let _asyncParallelHookClass: typeof AsyncParallelHook | undefined;
let _asyncSeriesWaterfallHookClass: typeof AsyncSeriesWaterfallHook | undefined;

/**
 * Creates a tapable `SyncHook` with the specified tap argument names.
 */
export function createSyncHook<T>(tapArgumentNames?: string[]): SyncHook<T> {
  if (!_syncHookClass) {
    _syncHookClass = require('tapable/lib/SyncHook') as typeof SyncHook;
  }
  return new _syncHookClass<T>(tapArgumentNames);
}

/**
 * Creates a tapable `AsyncParallelHook` with the specified tap argument names.
 */
export function createAsyncParallelHook<T>(tapArgumentNames?: string[]): AsyncParallelHook<T> {
  if (!_asyncParallelHookClass) {
    _asyncParallelHookClass = require('tapable/lib/AsyncParallelHook') as typeof AsyncParallelHook;
  }
  return new _asyncParallelHookClass<T>(tapArgumentNames);
}

/**
 * Creates a tapable `AsyncSeriesWaterfallHook` with the specified tap argument names.
 */
export function createAsyncSeriesWaterfallHook<T>(tapArgumentNames?: string[]): AsyncSeriesWaterfallHook<T> {
  if (!_asyncSeriesWaterfallHookClass) {
    _asyncSeriesWaterfallHookClass =
      require('tapable/lib/AsyncSeriesWaterfallHook') as typeof AsyncSeriesWaterfallHook;
  }
  return new _asyncSeriesWaterfallHookClass<T>(tapArgumentNames);
}

/**
 * Defines an enumerable property on `target` whose value is created by `factory` when the property is first
 * read. Once read (or assigned), the property is replaced with an ordinary writable data property, so it then
 * behaves exactly like a property that was assigned in a constructor or object literal.
 *
 * @returns A function that reports whether the property has been materialized, i.e. whether it has been
 * read (invoking `factory`) or assigned. While it has not been materialized, nothing can have observed its value.
 */
export function defineLazyProperty<TTarget extends object, TKey extends keyof TTarget>(
  target: TTarget,
  key: TKey,
  factory: () => TTarget[TKey]
): () => boolean {
  let materialized: boolean = false;
  let currentValue: TTarget[TKey];
  const materialize = (value: TTarget[TKey]): void => {
    materialized = true;
    currentValue = value;
    const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor?.configurable) {
      Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
    // Otherwise the target was frozen or sealed; keep serving the value from the accessor.
  };

  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get(): TTarget[TKey] {
      if (!materialized) {
        materialize(factory());
      }
      return currentValue;
    },
    set(value: TTarget[TKey]): void {
      materialize(value);
    }
  });

  return () => materialized;
}
