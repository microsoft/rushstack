// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PathOrFileDescriptor } from 'node:fs';

import { Volume } from 'memfs/lib/volume';
import type { Resolver, InputFileSystem } from 'webpack';

import type { IPrefixMatch } from '@rushstack/lookup-by-path';

import { WorkspaceLayoutCache, type IResolveContext } from '../WorkspaceLayoutCache.ts';

export type ResolveCallback = Parameters<Resolver['hooks']['result']['tapAsync']>[1];
export type ResolveRequest = Parameters<ResolveCallback>[0];
export type ResolveContext = Parameters<ResolveCallback>[1];
export type WrappedResolve = (
  request: ResolveRequest,
  resolveContext: ResolveContext
  // eslint-disable-next-line @rushstack/no-new-null
) => [Error | false | null | undefined, ResolveRequest | undefined];

export type JsonObjectTypes = ReturnType<NonNullable<InputFileSystem['readJsonSync']>>;
export const parsedJson: Record<string, JsonObjectTypes> = {
  '/workspace/a/package.json': { name: 'a' },
  '/workspace/a/lib-esm/package.json': { type: 'module' },
  '/workspace/b/package.json': { name: 'b', dependencies: { a: 'workspace:*' }, bundledDepencies: ['c'] },
  '/workspace/b/node_modules/c/package.json': { name: 'c' }
};

export function createResolveForTests(
  separator: '/' | '\\',
  attachPlugins: (cache: WorkspaceLayoutCache, resolver: Resolver) => void
): WrappedResolve {
  const fileSystem: Volume = new Volume();

  const cache: WorkspaceLayoutCache = new WorkspaceLayoutCache({
    cacheData: {
      basePath: `/workspace/`,
      contexts: [
        {
          root: 'a',
          name: 'a',
          deps: {},
          dirInfoFiles: ['lib-esm']
        },
        {
          root: 'b',
          name: 'b',
          deps: { a: 0, c: 2 }
        },
        {
          root: 'b/node_modules/c',
          name: 'c',
          deps: {}
        }
      ]
    },
    resolverPathSeparator: separator
  });

  const platformJson: Record<string, JsonObjectTypes> = Object.fromEntries(
    Object.entries(parsedJson).map(([key, value]) => [cache.normalizeToPlatform?.(key) ?? key, value])
  );

  const serializedJson: Record<string, string> = Object.fromEntries(
    Object.entries(platformJson).map(([key, value]) => [key, JSON.stringify(value)])
  );

  fileSystem.fromJSON(serializedJson);
  (fileSystem as InputFileSystem).readJson = (
    pathOrFileDescriptor: PathOrFileDescriptor,
    cb: (err: Error | null, data?: JsonObjectTypes) => void
  ) => {
    if (typeof pathOrFileDescriptor === 'number') {
      return cb(new Error(`Expected string path, got ${pathOrFileDescriptor}`));
    }
    const path: string = pathOrFileDescriptor.toString();
    const parsed: JsonObjectTypes | undefined = platformJson[path];
    if (parsed) {
      return cb(null, parsed);
    }
    return cb(new Error(`No data found for ${path}`));
  };

  let innerCallback: ResolveCallback | undefined = undefined;

  const resolver: Resolver = {
    fileSystem,
    doResolve: (
      step: string,
      request: ResolveRequest,
      message: string,
      resolveContext: ResolveContext,
      callback: (err: Error | undefined, result: ResolveRequest | undefined) => void
    ) => {
      return callback(undefined, request);
    },
    ensureHook: (step: string) => {
      expect(step).toEqual('target');
    },
    getHook: (step: string) => {
      expect(step).toEqual('source');
      return {
        tapAsync: (
          name: string,
          cb: (request: ResolveRequest, resolveContext: ResolveContext, callback: () => void) => void
        ) => {
          innerCallback = cb;
        }
      };
    }
  } as unknown as Resolver;

  // Backfill the contexts
  for (const [path, json] of Object.entries(platformJson)) {
    const contextList: IPrefixMatch<IResolveContext> | undefined =
      cache.contextLookup.findLongestPrefixMatch(path);
    if (!contextList) throw new Error(`No context found for ${path}`);
    cache.contextForPackage.set(json, contextList);
  }

  attachPlugins(cache, resolver);

  return (
    request: ResolveRequest,
    resolveContext: ResolveContext
  ): [Error | false | null | undefined, ResolveRequest | undefined] => {
    let result!: [Error | false | null | undefined, ResolveRequest | undefined];
    innerCallback!(request, resolveContext, ((
      err: Error | null | false | undefined,
      next: ResolveRequest | undefined
    ) => {
      result = [err, next];
    }) as unknown as Parameters<ResolveCallback>[2]);
    return result;
  };
}
