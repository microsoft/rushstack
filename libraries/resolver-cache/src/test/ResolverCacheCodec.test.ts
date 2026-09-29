// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeResolverCache, encodeResolverCache, isResolverCacheBinary } from '../ResolverCacheCodec';
import { parseResolverCache } from '../parseResolverCache';
import { ResolverCacheHashAlgorithm, type IResolverCacheFile } from '../types';

const SAMPLE: IResolverCacheFile = {
  basePath: '/repo/',
  contexts: [
    {
      root: 'common/temp/default/node_modules/.pnpm/lodash@4.17.21/node_modules/lodash',
      name: 'lodash'
    },
    {
      root: 'common/temp/default/node_modules/.pnpm/react@18.2.0/node_modules/react',
      name: 'react',
      deps: { lodash: 0 }
    },
    {
      root: 'libraries/example',
      name: '@scope/example',
      deps: { lodash: 0, react: 1 },
      dirInfoFiles: ['lib/esm/package.json']
    }
  ]
};

describe('ResolverCacheCodec', () => {
  it('round-trips a cache without hashes', () => {
    const encoded: Uint8Array = encodeResolverCache({ cache: SAMPLE });

    expect(isResolverCacheBinary(encoded)).toBe(true);
    const decoded: IResolverCacheFile = decodeResolverCache(encoded);
    expect(decoded.basePath).toEqual(SAMPLE.basePath);
    expect(decoded.contexts).toEqual(SAMPLE.contexts);
  });

  it('round-trips a cache with hashes', () => {
    const hashes: Uint8Array[] = SAMPLE.contexts.map((_context, index: number) =>
      new Uint8Array(32).fill(index + 1)
    );

    const decoded = decodeResolverCache(encodeResolverCache({ cache: SAMPLE, hashes, scoped: true }));

    expect(decoded.hashAlgorithm).toEqual(ResolverCacheHashAlgorithm.Sha256);
    expect(decoded.hashes.map((hash: Uint8Array) => Array.from(hash))).toEqual(
      hashes.map((hash: Uint8Array) => Array.from(hash))
    );
  });

  it('is substantially smaller than the equivalent JSON', () => {
    const encoded: Uint8Array = encodeResolverCache({ cache: SAMPLE });
    const json: Uint8Array = new TextEncoder().encode(JSON.stringify(SAMPLE));

    expect(encoded.length).toBeLessThan(json.length);
  });

  it('preserves non-ASCII package names', () => {
    const cache: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'packages/\u{1F600}a', name: '\u{1F600}a' },
        { root: 'packages/\u{1F601}b', name: '\u{1F601}b' },
        { root: 'packages/\u00e9', name: '\u00e9', deps: { '\u{1F600}a': 0 } }
      ]
    };

    expect(decodeResolverCache(encodeResolverCache({ cache })).contexts).toEqual(cache.contexts);
  });

  it('does not merge distinct contexts that share a package name and version', () => {
    // A PNPM injected dependency and the workspace project it was copied from share a name and
    // version but resolve their own dependencies differently. Merging them would silently change
    // module resolution.
    const cache: IResolverCacheFile = {
      basePath: '/repo/',
      contexts: [
        { root: 'common/temp/a/node_modules/.pnpm/typescript@4.9.5/node_modules/typescript', name: 'typescript' },
        { root: 'common/temp/a/node_modules/.pnpm/typescript@5.4.5/node_modules/typescript', name: 'typescript' },
        { root: 'eslint/eslint-config', name: '@rushstack/eslint-config', deps: { typescript: 0 } },
        {
          root: 'common/temp/a/node_modules/.pnpm/file+eslint+eslint-config_typescript@5.4.5/node_modules/@rushstack/eslint-config',
          name: '@rushstack/eslint-config',
          deps: { typescript: 1 }
        }
      ]
    };

    const decoded: IResolverCacheFile = decodeResolverCache(encodeResolverCache({ cache }));

    expect(decoded.contexts).toHaveLength(4);
    expect(decoded.contexts[2].deps).toEqual({ typescript: 0 });
    expect(decoded.contexts[3].deps).toEqual({ typescript: 1 });
  });

  it('rejects a buffer with the wrong magic', () => {
    expect(() => decodeResolverCache(new Uint8Array([1, 2, 3, 4]))).toThrowErrorMatchingInlineSnapshot(
      `"The buffer is not a resolver cache binary file"`
    );
  });

  it('rejects a hash count that does not match the context count', () => {
    expect(() =>
      encodeResolverCache({ cache: SAMPLE, hashes: [new Uint8Array(32)] })
    ).toThrowErrorMatchingInlineSnapshot(
      `"Expected 3 hash(es) to match the context count, but received 1"`
    );
  });
});

describe('parseResolverCache', () => {
  it('reads the binary format', () => {
    const parsed = parseResolverCache(encodeResolverCache({ cache: SAMPLE }));
    expect(parsed.contexts).toEqual(SAMPLE.contexts);
  });

  it('falls back to the legacy monolithic JSON format', () => {
    const parsed = parseResolverCache(JSON.stringify(SAMPLE));
    expect(parsed.basePath).toEqual(SAMPLE.basePath);
    expect(parsed.contexts).toEqual(SAMPLE.contexts);
    expect(parsed.hashAlgorithm).toEqual(ResolverCacheHashAlgorithm.None);
  });

  it('falls back when handed JSON as bytes', () => {
    const parsed = parseResolverCache(new TextEncoder().encode(JSON.stringify(SAMPLE)));
    expect(parsed.contexts).toEqual(SAMPLE.contexts);
  });

  it('rejects JSON that is not a resolver cache', () => {
    expect(() => parseResolverCache('{"hello":"world"}')).toThrowErrorMatchingInlineSnapshot(
      `"The resolver cache JSON file is missing a \\"basePath\\" or \\"contexts\\" property"`
    );
  });
});

describe('decodeResolverCache corruption handling', () => {
  it('rejects an implausible context count instead of preallocating', () => {
    const encoded: Uint8Array = encodeResolverCache({
      cache: { basePath: '/repo/', contexts: [{ root: 'a', name: 'a' }] }
    });

    // Truncating the buffer leaves the declared context count larger than the remaining bytes
    // could possibly describe, which is exactly the condition `readCount` exists to reject before
    // any storage is preallocated from the declared count.
    expect(() => decodeResolverCache(encoded.subarray(0, encoded.length - 1))).toThrow(
      /Declared item count/
    );
  });

  it('rejects a buffer that does not start with the magic', () => {
    expect(() => decodeResolverCache(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(
      'not a resolver cache binary file'
    );
  });
});
