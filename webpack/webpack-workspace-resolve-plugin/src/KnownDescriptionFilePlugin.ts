// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { sep as directorySeparator } from 'node:path';

import type { Resolver } from 'webpack';
import type { IPrefixMatch } from '@rushstack/lookup-by-path';
import type { IResolveContext, WorkspaceLayoutCache } from './WorkspaceLayoutCache';

import { normalizeToSlash } from './normalizeSlashes';

type ResolveRequest = Parameters<Resolver['hooks']['resolveStep']['call']>[1];

/**
 * A resolver plugin that optimizes locating the package.json file for a module.
 */
export class KnownDescriptionFilePlugin {
  public readonly source: string;
  public readonly target: string;

  private readonly _skipForContext: boolean;
  private readonly _cache: WorkspaceLayoutCache;

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
    function readDescriptionFileAsJson(
      descriptionFilePath: string,
      callback: (err: Error | null | undefined, data?: object) => void
    ): void {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fileSystem.readJson!(descriptionFilePath, callback);
    }

    function readDescriptionFileWithParse(
      descriptionFilePath: string,
      callback: (err: Error | null | undefined, data?: object) => void
    ): void {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fileSystem.readFile(descriptionFilePath, (err: Error | null | undefined, data?: string | Buffer) => {
        if (!data?.length) {
          return callback(err);
        }
        // eslint-disable-next-line @rushstack/no-new-null
        callback(null, JSON.parse(data.toString()));
      });
    }

    const readDescriptionFile: (
      descriptionFilePath: string,
      cb: (err: Error | null | undefined, data?: object) => void
    ) => void = fileSystem.readJson ? readDescriptionFileAsJson : readDescriptionFileWithParse;

    resolver
      .getHook(this.source)
      .tapAsync(KnownDescriptionFilePlugin.name, (request, resolveContext, callback) => {
        const { path } = request;
        // No request, nothing to do.
        if (!path) return callback();

        const cache: WorkspaceLayoutCache = this._cache;

        const match: IPrefixMatch<IResolveContext> | undefined =
          cache.contextLookup.findLongestPrefixMatch(path);
        // No description file available, proceed without.
        if (!match) return callback();

        const relativePath: string = `.${normalizeToSlash(path.slice(match.index))}`;
        const descriptionFileRoot: string = `${path.slice(0, match.index)}`;
        const descriptionFilePath: string = `${descriptionFileRoot}${directorySeparator}package.json`;

        const { contextForPackage } = cache;

        readDescriptionFile(descriptionFilePath, (err, descriptionFileData) => {
          if (!descriptionFileData) {
            resolveContext.missingDependencies?.add(descriptionFilePath);
            return callback(err);
          }

          resolveContext.fileDependencies?.add(descriptionFilePath);
          // Store the resolver context since a WeakMap lookup is cheaper than walking the tree again
          contextForPackage.set(descriptionFileData, match.value);

          // Since we don't allow any alternative processing of request, we can mutate it
          // instead of cloning it.
          request.descriptionFileRoot = descriptionFileRoot;
          request.descriptionFilePath = descriptionFilePath;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          request.descriptionFileData = descriptionFileData as any;
          request.relativePath = relativePath;

          resolver.doResolve(
            target,
            request,
            'using description file: ' + descriptionFilePath + ' (relative path: ' + relativePath + ')',
            resolveContext,
            (e: Error | undefined, result: ResolveRequest | undefined) => {
              if (e) return callback(e);

              // Don't allow other processing
              // eslint-disable-next-line @rushstack/no-new-null
              if (result === undefined) return callback(null, null);
              // eslint-disable-next-line @rushstack/no-new-null
              callback(null, result);
            }
          );
        });
      });
  }
}
