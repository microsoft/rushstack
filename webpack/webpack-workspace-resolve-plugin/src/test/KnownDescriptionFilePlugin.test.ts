// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { KnownDescriptionFilePlugin } from '../KnownDescriptionFilePlugin.ts';

import {
  parsedJson,
  createResolveForTests,
  type WrappedResolve,
  type ResolveContext
} from './createResolveForTests.ts';

function createResolve(separator: '/' | '\\'): WrappedResolve {
  return createResolveForTests(separator, (cache, resolver) => {
    const plugin: KnownDescriptionFilePlugin = new KnownDescriptionFilePlugin(cache, 'source', 'target');
    plugin.apply(resolver);
  });
}

describe(KnownDescriptionFilePlugin.name, () => {
  it('should resolve the package.json file for a module (/)', () => {
    const resolver: WrappedResolve = createResolve('/');

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

  it('should resolve the package.json file for a module (\\)', () => {
    const resolver: WrappedResolve = createResolve('\\');

    const fileDependencies: Set<string> = new Set();
    const context: ResolveContext = { fileDependencies };

    const [err1, result1] = resolver({ path: '\\workspace\\a\\lib\\index.js' }, context);
    expect(err1).toBeNull();
    expect(result1).toEqual({
      path: '\\workspace\\a\\lib\\index.js',
      descriptionFileRoot: '\\workspace\\a',
      descriptionFileData: parsedJson['/workspace/a/package.json'],
      descriptionFilePath: '\\workspace\\a\\package.json',
      relativePath: './lib/index.js'
    });
    expect(fileDependencies.size).toEqual(1);
    expect(fileDependencies.has('\\workspace\\a\\package.json')).toBeTruthy();

    fileDependencies.clear();

    const [err2, result2] = resolver({ path: '\\workspace\\a\\foo\\bar\\baz.js' }, context);
    expect(err2).toBeNull();
    expect(result2).toMatchObject({
      path: '\\workspace\\a\\foo\\bar\\baz.js',
      descriptionFileRoot: '\\workspace\\a',
      descriptionFileData: parsedJson['/workspace/a/package.json'],
      descriptionFilePath: '\\workspace\\a\\package.json',
      relativePath: './foo/bar/baz.js'
    });
    expect(fileDependencies.size).toEqual(1);
    expect(fileDependencies.has('\\workspace\\a\\package.json')).toBeTruthy();

    fileDependencies.clear();

    const [err3, result3] = resolver({ path: '\\workspace\\a\\lib-esm\\index.js' }, context);
    expect(err3).toBeNull();
    expect(result3).toMatchObject({
      path: '\\workspace\\a\\lib-esm\\index.js',
      descriptionFileRoot: '\\workspace\\a\\lib-esm',
      descriptionFileData: parsedJson['/workspace/a/lib-esm/package.json'],
      descriptionFilePath: '\\workspace\\a\\lib-esm\\package.json',
      relativePath: './index.js'
    });
    expect(fileDependencies.size).toEqual(1);
    expect(fileDependencies.has('\\workspace\\a\\lib-esm\\package.json')).toBeTruthy();

    fileDependencies.clear();
  });

  it('should defer to other plugins if not in a context', () => {
    const resolver: WrappedResolve = createResolve('/');

    const [err1, result1] = resolver({ path: '/workspace/c/lib/index.js' }, {});
    expect(err1).toBeUndefined();
    expect(result1).toBeUndefined();
  });
});
