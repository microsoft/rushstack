// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeResolverCache, isResolverCacheBinary } from './ResolverCacheCodec';
import { ResolverCacheHashAlgorithm, type IHashedResolverCacheFile, type IResolverCacheFile } from './types';

/**
 * Parses a resolver cache from either the binary format or the legacy monolithic JSON format.
 *
 * @remarks
 * The two formats are distinguished by the binary magic, not by file extension, so a consumer can
 * attempt the scoped per-project binary file and transparently fall back to the workspace-wide JSON
 * cache without knowing which one it was handed.
 *
 * @beta
 */
export function parseResolverCache(data: Uint8Array | string): IHashedResolverCacheFile {
  if (typeof data !== 'string' && isResolverCacheBinary(data)) {
    return decodeResolverCache(data);
  }

  const text: string = typeof data === 'string' ? data : new TextDecoder('utf-8', { fatal: true }).decode(data);
  const parsed: IResolverCacheFile = JSON.parse(text);

  if (typeof parsed?.basePath !== 'string' || !Array.isArray(parsed?.contexts)) {
    throw new Error('The resolver cache JSON file is missing a "basePath" or "contexts" property');
  }

  return {
    basePath: parsed.basePath,
    contexts: parsed.contexts,
    hashAlgorithm: ResolverCacheHashAlgorithm.None,
    hashes: []
  };
}
