// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A dedicated binary format for the Rush resolver cache, along with helpers for hashing and
 * slicing the dependency graph it describes.
 *
 * @remarks
 * The format is optimized for a single linear decode. Strings are stored once, in a
 * lexicographically sorted front-coded table whose suffixes share a single UTF-8 blob, and all
 * integers are variable-length encoded as deltas against a nearby value.
 *
 * @packageDocumentation
 */

export {
  decodeResolverCache,
  encodeResolverCache,
  isResolverCacheBinary,
  RESOLVER_CACHE_FORMAT_VERSION,
  RESOLVER_CACHE_MAGIC,
  type IEncodeResolverCacheOptions
} from './ResolverCacheCodec';

export { computeContextHashes, type HashFunction } from './computeContextHashes';

export { sliceResolverCache, type IResolverCacheSlice } from './sliceResolverCache';

export { parseResolverCache } from './parseResolverCache';

export {
  ResolverCacheHashAlgorithm,
  type IHashedResolverCacheFile,
  type IResolverCacheFile,
  type ISerializedResolveContext
} from './types';
