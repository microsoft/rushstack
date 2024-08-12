// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Volume } from 'memfs/lib/volume';
import type { Compiler, Resolver } from 'webpack';
import { KnownPackageDependenciesPlugin } from '../KnownPackageDependenciesPlugin';
import { type IResolveContext, WorkspaceLayoutCache } from '../WorkspaceLayoutCache';

type ResolveCallback = Parameters<Resolver['hooks']['result']['tapAsync']>[1];
type ResolveRequest = Parameters<ResolveCallback>[0];
type ResolveContext = Parameters<ResolveCallback>[1];
// eslint-disable-next-line @rushstack/no-new-null
type WrappedResolve = (
  request: ResolveRequest,
  resolveContext: ResolveContext
) => [Error | false | null | undefined, ResolveRequest | undefined];

const parsedJson: Record<string, object> = {
  '/workspace/a/package.json': { name: 'a' },
  '/workspace/a/lib-esm/package.json': { type: 'module' },
  '/workspace/b/package.json': { name: 'b', dependencies: { a: 'workspace:*' } }
};

function createResolve(): WrappedResolve {
  const fileSystem: Volume = new Volume();

  const serializedJson: Record<string, string> = Object.fromEntries(
    Object.entries(parsedJson).map(([key, value]) => [key, JSON.stringify(value)])
  );

  fileSystem.fromJSON(serializedJson);
  (fileSystem as Compiler['inputFileSystem']).readJson = (
    path: string,
    cb: (err: Error | null | undefined, data?: object) => void
  ) => {
    const parsed: object | undefined = parsedJson[path];
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
          expect(name).toEqual(KnownPackageDependenciesPlugin.name);
          innerCallback = cb;
        }
      };
    }
  } as unknown as Resolver;

  const cache: WorkspaceLayoutCache = new WorkspaceLayoutCache({
    workspaceRoot: '/workspace',
    cacheData: {
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
          deps: { a: 0 }
        }
      ]
    }
  });

  // Backfill the contexts
  for (const [path, json] of Object.entries(parsedJson)) {
    const context: IResolveContext | undefined = cache.contextLookup.findChildPath(path);
    if (!context) throw new Error(`No context found for ${path}`);
    cache.contextForPackage.set(json, context);
  }

  const plugin: KnownPackageDependenciesPlugin = new KnownPackageDependenciesPlugin(
    cache,
    'source',
    'target'
  );
  plugin.apply(resolver);

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

describe(KnownPackageDependenciesPlugin.name, () => {
  it('should find a relevant dependency', () => {
    const resolver: WrappedResolve = createResolve();

    const descriptionFilePath: string = '/workspace/b/package.json';
    const descriptionFileData: object = parsedJson[descriptionFilePath];
    const descriptionFileRoot: string = '/workspace/b';

    const [err1, result1] = resolver(
      {
        path: '/workspace/b/lib/foo.js',
        request: 'a/lib/index.js',
        descriptionFileRoot,
        descriptionFileData,
        descriptionFilePath,
        relativePath: './lib/foo.js'
      },
      {}
    );

    expect(err1).toBeFalsy();
    expect(result1).toEqual({
      path: '/workspace/a',
      request: './lib/index.js',
      descriptionFileRoot: '/workspace/a',
      descriptionFilePath: '/workspace/a/package.json',
      relativePath: './lib/index.js',
      fullySpecified: undefined,
      module: false
    });
  });

  it('should handle self-reference', () => {
    const resolver: WrappedResolve = createResolve();

    const descriptionFilePath: string = '/workspace/b/package.json';
    const descriptionFileData: object = parsedJson[descriptionFilePath];
    const descriptionFileRoot: string = '/workspace/b';

    const [err1, result1] = resolver(
      {
        path: '/workspace/b/lib/foo.js',
        request: 'b/lib/bar.js',
        descriptionFileRoot,
        descriptionFileData,
        descriptionFilePath,
        relativePath: './lib/foo.js'
      },
      {}
    );

    expect(err1).toBeFalsy();
    expect(result1).toEqual({
      path: '/workspace/b',
      request: './lib/bar.js',
      descriptionFileRoot: '/workspace/b',
      descriptionFilePath: '/workspace/b/package.json',
      relativePath: './lib/bar.js',
      fullySpecified: undefined,
      module: false
    });
  });

  it('should defer to other plugins if not in a context', () => {
    const resolver: WrappedResolve = createResolve();

    const [err1, result1] = resolver({ path: '/workspace/c/lib/index.js' }, {});
    expect(err1).toBeUndefined();
    expect(result1).toBeUndefined();
  });

  it('should defer to other plugins if the dependency is not found (for fallback)', () => {
    const resolver: WrappedResolve = createResolve();

    const descriptionFilePath: string = '/workspace/a/package.json';
    const descriptionFileData: object = parsedJson[descriptionFilePath];
    const descriptionFileRoot: string = '/workspace/a';

    const [err1, result1] = resolver(
      {
        path: '/workspace/a/lib/foo.js',
        request: 'events',
        descriptionFileRoot,
        descriptionFileData,
        descriptionFilePath,
        relativePath: './lib/foo.js'
      },
      {}
    );

    expect(err1).toBeUndefined();
    expect(result1).toBeUndefined();
  });
});
