// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { sep as directorySeparator } from 'node:path';

import { LookupByPath, type IPrefixMatch } from '@rushstack/lookup-by-path';
import type { IResolverCacheFile, ISerializedResolveContext } from '@rushstack/resolver-cache';

/**
 * A context for resolving dependencies in a workspace.
 * @beta
 */
export interface IResolveContext {
  /**
   * The absolute path to the root folder of this context
   */
  descriptionFileRoot: string;
  /**
   * Find the context that corresponds to a module specifier, when requested in the current context.
   * @param request - The module specifier to resolve
   */
  findDependency(request: string): IPrefixMatch<IResolveContext> | undefined;
}

/**
 * Options for creating a `WorkspaceLayoutCache`.
 * @beta
 */
export interface IWorkspaceLayoutCacheOptions {
  /**
   * The parsed cache data. File reading is left as an exercise for the caller.
   */
  cacheData: IResolverCacheFile;
  /**
   * The directory separator used in the `path` field of the resolver inputs.
   * Will usually be `path.sep`.
   */
  resolverPathSeparator?: '/' | '\\';
}

/**
 * A function that normalizes a path to a platform-specific format (if needed).
 * Will be undefined if the platform uses `/` as the path separator.
 *
 * @beta
 */
export type IPathNormalizationFunction = ((input: string) => string) | undefined;

function backslashToSlash(path: string): string {
  return path.replace(/\\/g, '/');
}

function slashToBackslash(path: string): string {
  return path.replace(/\//g, '\\');
}

/**
 * A cache of workspace layout information.
 * @beta
 */
export class WorkspaceLayoutCache {
  /**
   * A lookup of context roots to their corresponding context objects
   */
  public readonly contextLookup: LookupByPath<IResolveContext>;
  /**
   * A weak map of package JSON contents to their corresponding context objects
   */
  public readonly contextForPackage: WeakMap<object, IPrefixMatch<IResolveContext>>;

  public readonly resolverPathSeparator: string;
  public readonly normalizeToSlash: IPathNormalizationFunction;
  public readonly normalizeToPlatform: IPathNormalizationFunction;

  public constructor(options: IWorkspaceLayoutCacheOptions) {
    const { cacheData, resolverPathSeparator = directorySeparator } = options;

    if (resolverPathSeparator !== '/' && resolverPathSeparator !== '\\') {
      throw new Error(`Unsupported directory separator: ${resolverPathSeparator}`);
    }

    const { basePath } = cacheData;
    const resolveContexts: ResolveContext[] = [];
    const contextLookup: LookupByPath<IResolveContext> = new LookupByPath(undefined, resolverPathSeparator);

    this.contextLookup = contextLookup;
    this.contextForPackage = new WeakMap<object, IPrefixMatch<IResolveContext>>();

    const normalizeToSlash: IPathNormalizationFunction =
      resolverPathSeparator === '\\' ? backslashToSlash : undefined;
    const normalizeToPlatform: IPathNormalizationFunction =
      resolverPathSeparator === '\\' ? slashToBackslash : undefined;

    this.resolverPathSeparator = resolverPathSeparator;
    this.normalizeToSlash = normalizeToSlash;
    this.normalizeToPlatform = normalizeToPlatform;

    // Internal class due to coupling to `resolveContexts`
    class ResolveContext implements IResolveContext {
      readonly #serialized: ISerializedResolveContext;
      #descriptionFileRoot: string | undefined;
      #dependencies: LookupByPath<IResolveContext> | undefined;

      public constructor(serialized: ISerializedResolveContext) {
        this.#serialized = serialized;
        this.#descriptionFileRoot = undefined;
        this.#dependencies = undefined;
      }

      public get descriptionFileRoot(): string {
        if (!this.#descriptionFileRoot) {
          const merged: string = `${basePath}${this.#serialized.root}`;
          this.#descriptionFileRoot = normalizeToPlatform?.(merged) ?? merged;
        }
        return this.#descriptionFileRoot;
      }

      public findDependency(request: string): IPrefixMatch<IResolveContext> | undefined {
        if (!this.#dependencies) {
          // Lazy initialize this object since most packages won't be requested.
          const dependencies: LookupByPath<IResolveContext> = new LookupByPath(undefined, '/');

          const { name, deps } = this.#serialized;

          // Handle the self-reference scenario
          dependencies.setItem(name, this);
          if (deps) {
            for (const [key, ordinal] of Object.entries(deps)) {
              // This calls into the array of instances that is owned by WorkpaceLayoutCache
              dependencies.setItem(key, resolveContexts[ordinal]);
            }
          }
          this.#dependencies = dependencies;
        }

        return this.#dependencies.findLongestPrefixMatch(request);
      }
    }

    for (const serialized of cacheData.contexts) {
      const resolveContext: ResolveContext = new ResolveContext(serialized);
      resolveContexts.push(resolveContext);

      contextLookup.setItemFromSegments(
        concat<string>(
          // All paths in the cache file are platform-agnostic
          LookupByPath.iteratePathSegments(basePath, '/'),
          LookupByPath.iteratePathSegments(serialized.root, '/')
        ),
        resolveContext
      );

      // Handle nested package.json files. These may modify some properties, but the dependency resolution
      // will match the original package root. Typically these are used to set the `type` field to `module`.
      if (serialized.dirInfoFiles) {
        for (const file of serialized.dirInfoFiles) {
          contextLookup.setItemFromSegments(
            concat<string>(
              // All paths in the cache file are platform-agnostic
              concat<string>(
                LookupByPath.iteratePathSegments(basePath, '/'),
                LookupByPath.iteratePathSegments(serialized.root, '/')
              ),
              LookupByPath.iteratePathSegments(file, '/')
            ),
            resolveContext
          );
        }
      }
    }
  }
}

function* concat<T>(a: Iterable<T>, b: Iterable<T>): IterableIterator<T> {
  yield* a;
  yield* b;
}
