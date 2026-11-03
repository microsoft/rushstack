// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IResolverCacheFile, ISerializedResolveContext } from './types';

/**
 * A digest function, for example a wrapper around `node:crypto`.
 *
 * @remarks
 * Supplying the digest keeps this package free of a runtime dependency on `node:crypto`, so that
 * bundlers can include the decoder without pulling in Node built-ins.
 *
 * @beta
 */
export type HashFunction = (data: Uint8Array) => Uint8Array;

const TEXT_ENCODER: TextEncoder = new TextEncoder();

/**
 * Partitions the dependency graph into strongly connected components using an iterative Tarjan
 * traversal, returning the components in reverse topological order so that every component is
 * emitted only after all of the components it depends upon.
 *
 * @remarks
 * Cycles are not hypothetical: real PNPM lockfiles contain mutually dependent packages, so a naive
 * post-order Merkle recursion would either recurse forever or produce an order-dependent hash.
 * The traversal is iterative because dependency chains can be deeper than the JavaScript stack.
 */
function findStronglyConnectedComponents(adjacency: readonly number[][]): number[][] {
  const count: number = adjacency.length;
  const index: Int32Array = new Int32Array(count).fill(-1);
  const lowLink: Int32Array = new Int32Array(count);
  const onStack: Uint8Array = new Uint8Array(count);
  const tarjanStack: number[] = [];
  const components: number[][] = [];

  let nextIndex: number = 0;

  for (let start: number = 0; start < count; ++start) {
    if (index[start] !== -1) {
      continue;
    }

    // Each frame is [node, nextEdgeToVisit].
    const callStack: number[][] = [[start, 0]];
    index[start] = lowLink[start] = nextIndex++;
    tarjanStack.push(start);
    onStack[start] = 1;

    while (callStack.length > 0) {
      const frame: number[] = callStack[callStack.length - 1];
      const node: number = frame[0];
      const edges: number[] = adjacency[node];

      if (frame[1] < edges.length) {
        const next: number = edges[frame[1]++];
        if (index[next] === -1) {
          index[next] = lowLink[next] = nextIndex++;
          tarjanStack.push(next);
          onStack[next] = 1;
          callStack.push([next, 0]);
        } else if (onStack[next]) {
          lowLink[node] = Math.min(lowLink[node], index[next]);
        }
        continue;
      }

      callStack.pop();
      if (callStack.length > 0) {
        const parent: number = callStack[callStack.length - 1][0];
        lowLink[parent] = Math.min(lowLink[parent], lowLink[node]);
      }

      if (lowLink[node] === index[node]) {
        const component: number[] = [];
        for (;;) {
          const member: number = tarjanStack.pop()!;
          onStack[member] = 0;
          component.push(member);
          if (member === node) {
            break;
          }
        }
        components.push(component);
      }
    }
  }

  return components;
}

function toHex(bytes: Uint8Array): string {
  let result: string = '';
  for (let i: number = 0; i < bytes.length; ++i) {
    result += bytes[i].toString(16).padStart(2, '0');
  }
  return result;
}

/**
 * Computes a Merkle hash for every context in the cache.
 *
 * @remarks
 * The preimage of a context hash consists only of information derived from the lockfile: the root
 * path and package name of the context, the dependency keys it declares, and the hashes of the
 * contexts those keys resolve to. File contents, `package.json` contents, timestamps, and build
 * outputs are deliberately excluded, because Rush already tracks those through the build graph.
 * As a result these hashes can be computed from a checkout that has never been installed.
 *
 * Contexts that participate in a dependency cycle are condensed into a strongly connected
 * component and hashed as a unit, so that every member of the cycle observes the same content.
 *
 * @param cache - The graph to hash
 * @param hashFn - The digest function to use
 * @returns Raw digest bytes for each context, parallel to `cache.contexts`
 *
 * @beta
 */
export function computeContextHashes(cache: IResolverCacheFile, hashFn: HashFunction): Uint8Array[] {
  const { contexts } = cache;
  const adjacency: number[][] = contexts.map((context: ISerializedResolveContext) =>
    context.deps ? Array.from(new Set(Object.values(context.deps))) : []
  );

  for (const edges of adjacency) {
    for (const target of edges) {
      if (!Number.isInteger(target) || target < 0 || target >= contexts.length) {
        throw new Error(`Dependency ordinal ${target} is out of range`);
      }
    }
  }

  const hashes: (Uint8Array | undefined)[] = new Array(contexts.length);

  for (const component of findStronglyConnectedComponents(adjacency)) {
    // Sort by root path so that the component digest does not depend on traversal order.
    const members: number[] = component
      .slice()
      .sort((x: number, y: number) => (contexts[x].root < contexts[y].root ? -1 : 1));

    const positionInComponent: Map<number, number> = new Map();
    for (let i: number = 0; i < members.length; ++i) {
      positionInComponent.set(members[i], i);
    }

    const parts: string[] = [];
    for (const member of members) {
      const context: ISerializedResolveContext = contexts[member];
      parts.push(context.root, context.name);

      const deps: [string, number][] = Object.entries(context.deps ?? {}).sort(
        (x: [string, number], y: [string, number]) => (x[0] < y[0] ? -1 : 1)
      );
      for (const [key, target] of deps) {
        const cyclePosition: number | undefined = positionInComponent.get(target);
        if (cyclePosition !== undefined) {
          // Refer to cycle members positionally; their hashes are not yet available, and using the
          // position captures the shape of the cycle without introducing a circular dependency.
          parts.push(key, `cycle:${cyclePosition}`);
        } else {
          const targetHash: Uint8Array | undefined = hashes[target];
          if (!targetHash) {
            throw new Error(
              'Internal error: a dependency outside the current component has not been hashed yet'
            );
          }
          parts.push(key, toHex(targetHash));
        }
      }
    }

    const componentDigest: string = parts.join('\u0000');
    for (const member of members) {
      hashes[member] = hashFn(
        TEXT_ENCODER.encode(`${componentDigest}\u0000\u0000${contexts[member].root}`)
      );
    }
  }

  return hashes as Uint8Array[];
}
