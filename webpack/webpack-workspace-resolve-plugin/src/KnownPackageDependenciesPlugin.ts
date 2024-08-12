// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Resolver } from 'webpack';
import type { IPrefixMatch } from '@rushstack/lookup-by-path';
import type { IResolveContext, WorkspaceLayoutCache } from './WorkspaceLayoutCache';

type ResolveRequest = Parameters<Resolver['hooks']['resolveStep']['call']>[1];

/**
 * A resolver plugin that optimizes resolving installed dependencies for the current package.
 * Enforces strict resolution.
 */
export class KnownPackageDependenciesPlugin {
  public readonly source: string;
  public readonly target: string;

  private readonly _cache: WorkspaceLayoutCache;

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
        if (!path) return callback();
        if (!rawRequest) return callback();

        const { descriptionFileData } = request;
        if (!descriptionFileData) return callback(new Error(`Expected descriptionFileData for ${path}`));

        const cache: WorkspaceLayoutCache = this._cache;

        const context: IResolveContext | undefined = cache.contextForPackage.get(descriptionFileData);
        if (!context) return callback(new Error(`Expected context for ${request.descriptionFileRoot}`));

        const match: IPrefixMatch<IResolveContext> | undefined = context.findDependency(rawRequest);
        if (!match) return callback();

        const isPackageRoot: boolean = match.index === rawRequest.length;
        const fullySpecified: boolean | undefined = isPackageRoot ? false : request.fullySpecified;
        const relativePath: string = isPackageRoot
          ? '.'
          : `.${cache.normalizeToSlash(rawRequest.slice(match.index))}`;
        const { descriptionFileRoot } = match.value;
        const obj: ResolveRequest = {
          ...request,
          path: descriptionFileRoot,
          descriptionFileRoot,
          descriptionFileData: undefined,
          descriptionFilePath: `${descriptionFileRoot}${cache.resolverPathSeparator}package.json`,

          relativePath: relativePath,
          request: relativePath,
          fullySpecified,
          module: false
        };
        // eslint-disable-next-line @rushstack/no-new-null
        resolver.doResolve(target, obj, null, resolveContext, callback);
      });
  }
}
