// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import { computeContextHashes } from '../computeContextHashes';
import { sliceResolverCache, type IResolverCacheSlice } from '../sliceResolverCache';
import type { IResolverCacheFile } from '../types';

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function hashesOf(cache: IResolverCacheFile): string[] {
  return computeContextHashes(cache, sha256).map((hash: Uint8Array) => Buffer.from(hash).toString('hex'));
}

describe('computeContextHashes', () => {
  it('produces a distinct hash per context', () => {
    const cache: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a' },
        { root: 'b', name: 'b', deps: { a: 0 } },
        { root: 'c', name: 'c', deps: { a: 0, b: 1 } }
      ]
    };

    const hashes: string[] = hashesOf(cache);
    expect(new Set(hashes).size).toEqual(3);
    expect(hashes[0]).toHaveLength(64);
  });

  it('propagates a change in a transitive dependency', () => {
    const before: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: '.pnpm/leaf@1.0.0/node_modules/leaf', name: 'leaf' },
        { root: 'middle', name: 'middle', deps: { leaf: 0 } },
        { root: 'top', name: 'top', deps: { middle: 1 } }
      ]
    };
    const after: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: '.pnpm/leaf@1.0.1/node_modules/leaf', name: 'leaf' },
        { root: 'middle', name: 'middle', deps: { leaf: 0 } },
        { root: 'top', name: 'top', deps: { middle: 1 } }
      ]
    };

    expect(hashesOf(after)[2]).not.toEqual(hashesOf(before)[2]);
  });

  it('is insensitive to the ordering of dependency keys', () => {
    const forward: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a' },
        { root: 'b', name: 'b' },
        { root: 'c', name: 'c', deps: { a: 0, b: 1 } }
      ]
    };
    const reversed: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a' },
        { root: 'b', name: 'b' },
        { root: 'c', name: 'c', deps: { b: 1, a: 0 } }
      ]
    };

    expect(hashesOf(reversed)).toEqual(hashesOf(forward));
  });

  it('terminates on dependency cycles and hashes the cycle as a unit', () => {
    const cache: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a', deps: { b: 1 } },
        { root: 'b', name: 'b', deps: { a: 0 } },
        { root: 'c', name: 'c', deps: { a: 0 } }
      ]
    };

    const hashes: string[] = hashesOf(cache);
    expect(new Set(hashes).size).toEqual(3);
  });

  it('detects a change inside a dependency cycle', () => {
    const before: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a', deps: { b: 1 } },
        { root: 'b@1.0.0', name: 'b', deps: { a: 0 } }
      ]
    };
    const after: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a', deps: { b: 1 } },
        { root: 'b@1.0.1', name: 'b', deps: { a: 0 } }
      ]
    };

    expect(hashesOf(after)[0]).not.toEqual(hashesOf(before)[0]);
  });

  it('handles chains deeper than the call stack', () => {
    const contexts = [{ root: 'n0', name: 'n0' }];
    for (let i: number = 1; i < 50000; ++i) {
      contexts.push({ root: `n${i}`, name: `n${i}`, deps: { [`n${i - 1}`]: i - 1 } } as never);
    }

    expect(() => computeContextHashes({ basePath: '/repo/', contexts }, sha256)).not.toThrow();
  });

  it('gives injected copies a different hash than their source project', () => {
    // Same package name, different resolution: the injected copy sees typescript 5.4.5 while the
    // workspace project sees 4.9.5.
    const cache: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: '.pnpm/typescript@4.9.5/node_modules/typescript', name: 'typescript' },
        { root: '.pnpm/typescript@5.4.5/node_modules/typescript', name: 'typescript' },
        { root: 'eslint/eslint-config', name: 'config', deps: { typescript: 0 } },
        { root: '.pnpm/file+eslint+eslint-config/node_modules/config', name: 'config', deps: { typescript: 1 } }
      ]
    };

    const hashes: string[] = hashesOf(cache);
    expect(hashes[2]).not.toEqual(hashes[3]);
  });

  it('rejects out-of-range dependency ordinals', () => {
    expect(() =>
      computeContextHashes(
        { basePath: '/repo/', contexts: [{ root: 'a', name: 'a', deps: { b: 7 } }] },
        sha256
      )
    ).toThrowErrorMatchingInlineSnapshot(`"Dependency ordinal 7 is out of range"`);
  });
});

describe('sliceResolverCache', () => {
  const cache: IResolverCacheFile = {
    basePath: '/repo/',
    contexts: [
      { root: 'shared', name: 'shared' },
      { root: 'unrelated', name: 'unrelated' },
      { root: 'lib', name: 'lib', deps: { shared: 0 } },
      { root: 'app', name: 'app', deps: { lib: 2 } }
    ]
  };

  it('keeps only the reachable contexts and remaps ordinals', () => {
    const { cache: sliced, originalOrdinals }: IResolverCacheSlice = sliceResolverCache(cache, [3]);

    expect(sliced.contexts.map((context) => context.root)).toEqual(['shared', 'lib', 'app']);
    expect(originalOrdinals).toEqual([0, 2, 3]);
    expect(sliced.contexts[2].deps).toEqual({ lib: 1 });
    expect(sliced.contexts[1].deps).toEqual({ shared: 0 });
  });

  it('preserves the hash of every retained context', () => {
    const fullHashes: string[] = hashesOf(cache);
    const { cache: sliced, originalOrdinals }: IResolverCacheSlice = sliceResolverCache(cache, [3]);
    const slicedHashes: string[] = hashesOf(sliced);

    expect(slicedHashes).toEqual(originalOrdinals.map((ordinal: number) => fullHashes[ordinal]));
  });

  it('tolerates cycles', () => {
    const cyclic: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'a', name: 'a', deps: { b: 1 } },
        { root: 'b', name: 'b', deps: { a: 0 } },
        { root: 'c', name: 'c' }
      ]
    };

    expect(sliceResolverCache(cyclic, [0]).cache.contexts).toHaveLength(2);
  });

  it('rejects an out-of-range root', () => {
    expect(() => sliceResolverCache(cache, [9])).toThrowErrorMatchingInlineSnapshot(
      `"Root ordinal 9 is out of range"`
    );
  });
});
