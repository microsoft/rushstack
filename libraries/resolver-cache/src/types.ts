// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Information about a local or installed npm package.
 *
 * @remarks
 * This is the same shape as the legacy monolithic JSON resolver cache, so that consumers can treat
 * the binary and JSON representations interchangeably.
 *
 * @beta
 */
export interface ISerializedResolveContext {
  /**
   * The path to the root folder of this context, relative to {@link IResolverCacheFile.basePath}.
   * This path is normalized to use `/` as the separator and should not end with a trailing `/`.
   *
   * @remarks
   * This path is the sole identity of a context. Two contexts that share a package name and version
   * but differ in root path are distinct and must never be merged; in particular, a PNPM injected
   * dependency resolves its own dependencies within the consuming subspace and therefore has a
   * different dependency graph than the workspace project it was copied from.
   */
  root: string;
  /**
   * The name of this package. Used to inject a self-reference into the dependency map.
   */
  name: string;
  /**
   * Map of declared dependencies (if any) to the ordinal of the corresponding context.
   */
  deps?: Record<string, number>;
  /**
   * Set of relative paths to nested `package.json` files within this context.
   * These paths are normalized to use `/` as the separator and should not begin with a leading `./`.
   */
  dirInfoFiles?: string[];
}

/**
 * The deserialized form of a resolver cache, whether it was read from the binary format or from the
 * legacy monolithic JSON file.
 *
 * @beta
 */
export interface IResolverCacheFile {
  /**
   * The base path. All paths in context entries are prefixed by this path.
   */
  basePath: string;
  /**
   * The ordered list of all contexts in the cache.
   */
  contexts: ISerializedResolveContext[];
}

/**
 * Identifies the digest algorithm used for the per-context Merkle hashes.
 *
 * @beta
 */
export const enum ResolverCacheHashAlgorithm {
  /**
   * The file carries no per-context hashes.
   */
  None = 0,
  /**
   * SHA-256, stored as raw digest bytes (never hex, base64, or truncated).
   */
  Sha256 = 1
}

/**
 * A resolver cache that additionally carries the lockfile-derived Merkle hash of each context.
 *
 * @remarks
 * The hash preimage is purely lockfile-derived: a context's own root path and name, plus the hashes
 * of the contexts it resolves its dependencies to. It deliberately excludes file contents, build
 * outputs, and timestamps, which Rush tracks separately through the build graph. This keeps the
 * hash computable from a bare checkout that has never been installed.
 *
 * @beta
 */
export interface IHashedResolverCacheFile extends IResolverCacheFile {
  /**
   * The algorithm used to produce {@link IHashedResolverCacheFile.hashes}.
   */
  hashAlgorithm: ResolverCacheHashAlgorithm;
  /**
   * Raw digest bytes for each context, parallel to
   * {@link IResolverCacheFile.contexts}. Empty when the file carries no hashes.
   */
  hashes: readonly Uint8Array[];
}
