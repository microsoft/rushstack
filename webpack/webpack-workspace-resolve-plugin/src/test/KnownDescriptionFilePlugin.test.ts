// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Volume } from 'memfs/lib/volume';
import type { Compiler, Resolver } from 'webpack';
import { KnownDescriptionFilePlugin } from '../KnownDescriptionFilePlugin';
import { WorkspaceLayoutCache } from '../WorkspaceLayoutCache';

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
          expect(name).toEqual(KnownDescriptionFilePlugin.name);
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

  const plugin: KnownDescriptionFilePlugin = new KnownDescriptionFilePlugin(cache, 'source', 'target');
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

describe(KnownDescriptionFilePlugin.name, () => {
  it('should resolve the package.json file for a module', () => {
    const resolver: WrappedResolve = createResolve();

    const fileDependencies: Set<string> = new Set();
    const context: ResolveContext = { fileDependencies };

    const [err1, result1] = resolver({ path: '/workspace/a/lib/index.js' }, context);
    expect(err1).toBeNull();
    expect(result1).toEqual({
      path: '/workspace/a/lib/index.js',
      descriptionFileRoot: '/workspace/a',
      descriptionFileData: parsedJson['/workspace/a/package.json'],
      descriptionFilePath: '/workspace/a/package.json',
      relativePath: './lib/index.js'
    });
    expect(fileDependencies.size).toEqual(1);
    expect(fileDependencies.has('/workspace/a/package.json')).toBeTruthy();

    fileDependencies.clear();

    const [err2, result2] = resolver({ path: '/workspace/a/foo/bar/baz.js' }, context);
    expect(err2).toBeNull();
    expect(result2).toMatchObject({
      path: '/workspace/a/foo/bar/baz.js',
      descriptionFileRoot: '/workspace/a',
      descriptionFileData: parsedJson['/workspace/a/package.json'],
      descriptionFilePath: '/workspace/a/package.json',
      relativePath: './foo/bar/baz.js'
    });
    expect(fileDependencies.size).toEqual(1);
    expect(fileDependencies.has('/workspace/a/package.json')).toBeTruthy();

    fileDependencies.clear();

    const [err3, result3] = resolver({ path: '/workspace/a/lib-esm/index.js' }, context);
    expect(err3).toBeNull();
    expect(result3).toMatchObject({
      path: '/workspace/a/lib-esm/index.js',
      descriptionFileRoot: '/workspace/a/lib-esm',
      descriptionFileData: parsedJson['/workspace/a/lib-esm/package.json'],
      descriptionFilePath: '/workspace/a/lib-esm/package.json',
      relativePath: './index.js'
    });
    expect(fileDependencies.size).toEqual(1);
    expect(fileDependencies.has('/workspace/a/lib-esm/package.json')).toBeTruthy();

    fileDependencies.clear();
  });

  it('should defer to other plugins if not in a context', () => {
    const resolver: WrappedResolve = createResolve();

    const [err1, result1] = resolver({ path: '/workspace/c/lib/index.js' }, {});
    expect(err1).toBeUndefined();
    expect(result1).toBeUndefined();
  });
});
