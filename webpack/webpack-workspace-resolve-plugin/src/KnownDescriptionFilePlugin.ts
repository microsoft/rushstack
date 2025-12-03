// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { InputFileSystem, Resolver } from 'webpack';

import type { IPrefixMatch } from '@rushstack/lookup-by-path';

import type { IResolveContext, WorkspaceLayoutCache } from './WorkspaceLayoutCache';

type ResolveRequest = Parameters<Resolver['hooks']['resolveStep']['call']>[1];

/**
 * A resolver plugin that optimizes locating the package.json file for a module.
 *
 * @internal
 */
export class KnownDescriptionFilePlugin {
  public readonly source: string;
  public readonly target: string;

  private readonly _skipForContext: boolean;
  private readonly _cache: WorkspaceLayoutCache;

  /**
   * Constructs a new instance of `KnownDescriptionFilePlugin`.
   * @param cache - The workspace layout cache
   * @param source - The resolve step to hook into
   * @param target - The resolve step to delegate to
   * @param skipForContext - If true, don't apply this plugin if the resolver is configured to resolve to a context
   */
  public constructor(cache: WorkspaceLayoutCache, source: string, target: string, skipForContext?: boolean) {
    this.source = source;
    this.target = target;
    this._cache = cache;
    this._skipForContext = !!skipForContext;
  }

  public apply(resolver: Resolver): void {
    if (this._skipForContext && resolver.options.resolveToContext) {
      return;
    }

    const target: ReturnType<Resolver['ensureHook']> = resolver.ensureHook(this.target);
    const { fileSystem } = resolver;

    type JsonObjectTypes = ReturnType<NonNullable<InputFileSystem['readJsonSync']>>;

    function readDescriptionFileWithParse(
      descriptionFilePath: string,
      callback: (err: Error | null | undefined, data?: JsonObjectTypes) => void
    ): void {
      fileSystem.readFile(descriptionFilePath, (err: Error | null | undefined, data?: string | Buffer) => {
        if (!data?.length) {
          return callback(err);
        }
        callback(null, JSON.parse(data.toString()));
      });
    }

    const readDescriptionFile: (
      descriptionFilePath: string,
      cb: (err: Error | null | undefined, data?: JsonObjectTypes) => void
    ) => void = fileSystem.readJson?.bind(fileSystem) ?? readDescriptionFileWithParse;

    resolver
      .getHook(this.source)
      .tapAsync(KnownDescriptionFilePlugin.name, (request, resolveContext, callback) => {
        const { path } = request;
        if (!path) {
          // No request, nothing to do.
          return callback();
        }

        const cache: WorkspaceLayoutCache = this._cache;

        const match: IPrefixMatch<IResolveContext> | undefined =
          cache.contextLookup.findLongestPrefixMatch(path);
        if (!match) {
          // No description file available, proceed without.
          return callback();
        }

        const remainingPath: string = path.slice(match.index);
        const relativePath: string = `.${cache.normalizeToSlash?.(remainingPath) ?? remainingPath}`;
        const descriptionFileRoot: string = `${path.slice(0, match.index)}`;
        const descriptionFilePath: string = `${descriptionFileRoot}${cache.resolverPathSeparator}package.json`;

        const { contextForPackage } = cache;

        readDescriptionFile(descriptionFilePath, (err, descriptionFileData) => {
          if (!descriptionFileData) {
            resolveContext.missingDependencies?.add(descriptionFilePath);
            return callback(err);
          }

          resolveContext.fileDependencies?.add(descriptionFilePath);
          // Store the resolver context since a WeakMap lookup is cheaper than walking the tree again
          contextForPackage.set(descriptionFileData, match);

          // Using the object literal is an order of magnitude faster, at least on node 18.19.1
          const obj: ResolveRequest = {
            path: request.path,
            context: request.context,
            descriptionFilePath,
            descriptionFileRoot,
            descriptionFileData,
            relativePath,
            ignoreSymlinks: request.ignoreSymlinks,
            fullySpecified: request.fullySpecified,
            __innerRequest: request.__innerRequest,
            __innerRequest_request: request.__innerRequest_request,
            __innerRequest_relativePath: request.__innerRequest_relativePath,

            request: request.request,
            query: request.query,
            fragment: request.fragment,
            module: request.module,
            directory: request.directory,
            file: request.file,
            internal: request.internal
          };

          // Delegate to the resolver step at `target`.
          resolver.doResolve(
            target,
            obj,
            'using description file: ' + descriptionFilePath + ' (relative path: ' + relativePath + ')',
            resolveContext,
            (e: Error | null | undefined, result: ResolveRequest | undefined) => {
              if (e) {
                return callback(e);
              }

              // Don't allow other processing
              if (result === undefined) {
                return callback(null, null);
              }
              callback(null, result);
            }
          );
        });
      });
  }
}
