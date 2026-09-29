// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as v8 from 'node:v8';
import * as vm from 'node:vm';

interface IGarbageCollectionOptions {
  readonly type: 'major';
  readonly execution: 'sync';
  readonly flavor: 'last-resort';
}

type GarbageCollectionFunction = (options: IGarbageCollectionOptions) => void;

const REDUCING_GARBAGE_COLLECTION: IGarbageCollectionOptions = {
  type: 'major',
  execution: 'sync',
  // V8 runs full collections that reduce the memory footprint until nothing more is freed. Only these return the
  // freed pages to the operating system; a regular full collection keeps them pooled for reuse.
  flavor: 'last-resort'
};

/**
 * Returns a function that runs V8's memory-reducing full garbage collection, which returns the heap pages that it
 * frees to the operating system.
 *
 * @remarks
 * Unless the process already exposes `gc`, `--expose-gc` is set only while one new context is created, so
 * `globalThis.gc` stays undefined and contexts that are created later get no `gc` global.
 */
export function getReducingGarbageCollection(): () => void {
  let gc: unknown = (globalThis as { gc?: unknown }).gc;
  if (typeof gc !== 'function') {
    v8.setFlagsFromString('--expose-gc');
    try {
      gc = vm.runInNewContext('gc');
    } finally {
      v8.setFlagsFromString('--no-expose-gc');
    }
  }
  if (typeof gc !== 'function') {
    throw new Error('V8 did not provide a garbage collection function.');
  }
  const collect: GarbageCollectionFunction = gc as GarbageCollectionFunction;
  return () => collect(REDUCING_GARBAGE_COLLECTION);
}
