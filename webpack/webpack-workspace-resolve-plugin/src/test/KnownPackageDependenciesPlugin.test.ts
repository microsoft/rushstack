// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { KnownPackageDependenciesPlugin } from '../KnownPackageDependenciesPlugin.ts';
import {
  createResolveForTests,
  parsedJson,
  type WrappedResolve,
  type JsonObjectTypes
} from './createResolveForTests.ts';

function createResolve(separator: '/' | '\\'): WrappedResolve {
  return createResolveForTests(separator, (cache, resolver) => {
    const plugin: KnownPackageDependenciesPlugin = new KnownPackageDependenciesPlugin(
      cache,
      'source',
      'target'
    );
    plugin.apply(resolver);
  });
}

describe(KnownPackageDependenciesPlugin.name, () => {
  it('should find a relevant dependency (/)', () => {
    const resolver: WrappedResolve = createResolve('/');

    const descriptionFilePath: string = '/workspace/b/package.json';
    const descriptionFileData: JsonObjectTypes = parsedJson[descriptionFilePath];
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
  it('should find a relevant dependency (\\)', () => {
    const resolver: WrappedResolve = createResolve('\\');

    const descriptionFilePath: string = '\\workspace\\b\\package.json';
    const descriptionFileData: JsonObjectTypes = parsedJson['/workspace/b/package.json'];
    const descriptionFileRoot: string = '\\workspace\\b';

    const [err1, result1] = resolver(
      {
        path: '\\workspace\\b\\lib\\foo.js',
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
      path: '\\workspace\\a',
      request: './lib/index.js',
      descriptionFileRoot: '\\workspace\\a',
      descriptionFilePath: '\\workspace\\a\\package.json',
      relativePath: './lib/index.js',
      fullySpecified: undefined,
      module: false
    });
  });

  it('should handle self-reference', () => {
    const resolver: WrappedResolve = createResolve('/');

    const descriptionFilePath: string = '/workspace/b/package.json';
    const descriptionFileData: JsonObjectTypes = parsedJson[descriptionFilePath];
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

  it('should find a parent (/)', () => {
    const resolver: WrappedResolve = createResolve('/');

    const descriptionFilePath: string = '/workspace/b/node_modules/c/package.json';
    const descriptionFileData: JsonObjectTypes = parsedJson[descriptionFilePath];
    const descriptionFileRoot: string = '/workspace/b/node_modules/c';

    const [err1, result1] = resolver(
      {
        path: '/workspace/b/node_modules/c/lib/foo.js',
        request: 'b/lib/index.js',
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
      request: './lib/index.js',
      descriptionFileRoot: '/workspace/b',
      descriptionFilePath: '/workspace/b/package.json',
      relativePath: './lib/index.js',
      fullySpecified: undefined,
      module: false
    });
  });

  it('should resolve through a parent (/)', () => {
    const resolver: WrappedResolve = createResolve('/');

    const descriptionFilePath: string = '/workspace/b/node_modules/c/package.json';
    const descriptionFileData: JsonObjectTypes = parsedJson[descriptionFilePath];
    const descriptionFileRoot: string = '/workspace/b/node_modules/c';

    const [err1, result1] = resolver(
      {
        path: '/workspace/b/node_modules/c/lib/foo.js',
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

  it('should defer to other plugins if not in a context', () => {
    const resolver: WrappedResolve = createResolve('/');

    const [err1, result1] = resolver({ path: '/workspace/c/lib/index.js' }, {});
    expect(err1).toBeUndefined();
    expect(result1).toBeUndefined();
  });

  it('should defer to other plugins if the dependency is not found (for fallback)', () => {
    const resolver: WrappedResolve = createResolve('/');

    const descriptionFilePath: string = '/workspace/a/package.json';
    const descriptionFileData: JsonObjectTypes = parsedJson[descriptionFilePath];
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
