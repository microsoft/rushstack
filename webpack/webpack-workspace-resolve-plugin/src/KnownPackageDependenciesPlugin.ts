// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Resolver } from 'webpack';

import type { IPrefixMatch } from '@rushstack/lookup-by-path';

import type { IResolveContext, WorkspaceLayoutCache } from './WorkspaceLayoutCache.ts';

type ResolveRequest = Parameters<Resolver['hooks']['resolveStep']['call']>[1];

/**
 * A resolver plugin that optimizes resolving installed dependencies for the current package.
 * Enforces strict resolution.
 *
 * @internal
 */
export class KnownPackageDependenciesPlugin {
  public readonly source: string;
  public readonly target: string;

  private readonly _cache: WorkspaceLayoutCache;

  /**
   * Constructs a new instance of `KnownPackageDependenciesPlugin`.
   * @param cache - The workspace layout cache
   * @param source - The resolve step to hook into
   * @param target - The resolve step to delegate to
   */
  public constructor(cache: WorkspaceLayoutCache, source: string, target: string) {
    this.source = source;
    this.target = target;
    this._cache = cache;
  }

  public apply(resolver: Resolver): void {
    const target: ReturnType<Resolver['ensureHook']> = resolver.ensureHook(this.target);

    resolver
      .getHook(this.source)
      .tapAsync(KnownPackageDependenciesPlugin.name, (request, resolveContext, callback) => {
        const { path, request: rawRequest } = request;
        if (!path) {
          return callback();
        }

        if (!rawRequest) {
          return callback();
        }

        const { descriptionFileData } = request;
        if (!descriptionFileData) {
          return callback(new Error(`Expected descriptionFileData for ${path}`));
        }

        const cache: WorkspaceLayoutCache = this._cache;

        let scope: IPrefixMatch<IResolveContext> | undefined =
          cache.contextForPackage.get(descriptionFileData);
        if (!scope) {
          scope = cache.contextLookup.findLongestPrefixMatch(path);
          if (!scope) {
            return callback(new Error(`Expected context for ${request.descriptionFileRoot}`));
          }
          cache.contextForPackage.set(descriptionFileData, scope);
        }

        let dependency: IPrefixMatch<IResolveContext> | undefined;
        while (scope && !dependency) {
          dependency = scope.value.findDependency(rawRequest);
          scope = scope.lastMatch;
        }

        if (!dependency) {
          return callback();
        }

        const isPackageRoot: boolean = dependency.index === rawRequest.length;
        const fullySpecified: boolean | undefined = isPackageRoot ? false : request.fullySpecified;
        const remainingPath: string = isPackageRoot ? '.' : `.${rawRequest.slice(dependency.index)}`;
        const relativePath: string =
          (remainingPath.length > 1 && cache.normalizeToSlash?.(remainingPath)) || remainingPath;
        const { descriptionFileRoot } = dependency.value;
        const obj: ResolveRequest = {
          path: descriptionFileRoot,
          context: request.context,
          descriptionFilePath: `${descriptionFileRoot}${cache.resolverPathSeparator}package.json`,
          descriptionFileRoot,
          descriptionFileData: undefined,
          relativePath,
          ignoreSymlinks: request.ignoreSymlinks,
          fullySpecified,
          __innerRequest: request.__innerRequest,
          __innerRequest_request: request.__innerRequest_request,
          __innerRequest_relativePath: request.__innerRequest_relativePath,

          request: relativePath,
          query: request.query,
          fragment: request.fragment,
          module: false,
          directory: request.directory,
          file: request.file,
          internal: request.internal
        };
        resolver.doResolve(target, obj, null, resolveContext, callback);
      });
  }
}
