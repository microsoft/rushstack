// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IResolverCacheFile, ISerializedResolveContext } from './types';

/**
 * The result of {@link sliceResolverCache}.
 *
 * @beta
 */
export interface IResolverCacheSlice {
  /**
   * A cache containing only the contexts reachable from the requested roots, with all ordinals
   * remapped to the new, smaller index space.
   */
  cache: IResolverCacheFile;
  /**
   * The ordinal in the original cache that each context in the slice came from.
   */
  originalOrdinals: number[];
}

/**
 * Produces the slice of a resolver cache that is visible to a set of root contexts.
 *
 * @remarks
 * Computing a slice is a reachability filter followed by an index remap; no resolution decisions
 * are revisited. Reachability must follow every dependency edge, including edges that point at
 * workspace projects, because a project can resolve modules through its workspace dependencies.
 *
 * A slice is strictly more precise than the whole-workspace cache: a project cannot resolve a
 * package that is not reachable from it, so unrelated contexts are absent rather than merely
 * unused.
 *
 * @beta
 */
export function sliceResolverCache(
  cache: IResolverCacheFile,
  rootOrdinals: Iterable<number>
): IResolverCacheSlice {
  const { basePath, contexts } = cache;
  const reachable: Uint8Array = new Uint8Array(contexts.length);
  const queue: number[] = [];

  for (const rootOrdinal of rootOrdinals) {
    if (!Number.isInteger(rootOrdinal) || rootOrdinal < 0 || rootOrdinal >= contexts.length) {
      throw new Error(`Root ordinal ${rootOrdinal} is out of range`);
    }
    if (!reachable[rootOrdinal]) {
      reachable[rootOrdinal] = 1;
      queue.push(rootOrdinal);
    }
  }

  while (queue.length > 0) {
    const ordinal: number = queue.pop()!;
    const deps: Record<string, number> | undefined = contexts[ordinal].deps;
    if (!deps) {
      continue;
    }
    for (const target of Object.values(deps)) {
      if (target < 0 || target >= contexts.length) {
        throw new Error(`Dependency ordinal ${target} is out of range`);
      }
      if (!reachable[target]) {
        reachable[target] = 1;
        queue.push(target);
      }
    }
  }

  // Preserve the relative order of the original cache so that ordinal deltas stay small.
  const originalOrdinals: number[] = [];
  const remapped: Int32Array = new Int32Array(contexts.length).fill(-1);
  for (let ordinal: number = 0; ordinal < contexts.length; ++ordinal) {
    if (reachable[ordinal]) {
      remapped[ordinal] = originalOrdinals.length;
      originalOrdinals.push(ordinal);
    }
  }

  const slicedContexts: ISerializedResolveContext[] = originalOrdinals.map((ordinal: number) => {
    const context: ISerializedResolveContext = contexts[ordinal];
    const sliced: ISerializedResolveContext = { root: context.root, name: context.name };

    if (context.deps) {
      const deps: Record<string, number> = {};
      for (const [key, target] of Object.entries(context.deps)) {
        deps[key] = remapped[target];
      }
      sliced.deps = deps;
    }

    if (context.dirInfoFiles?.length) {
      sliced.dirInfoFiles = context.dirInfoFiles;
    }

    return sliced;
  });

  return {
    cache: { basePath, contexts: slicedContexts },
    originalOrdinals
  };
}
