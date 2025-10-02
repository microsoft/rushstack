// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { default as JestResolver } from 'jest-resolve';
import type { TransformOptions } from '@jest/transform';

import { FileSystem } from '@rushstack/node-core-library';

// See: https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L21
export type CacheKeyOptions = Pick<TransformOptions, 'config' | 'configString' | 'instrument'>;

// See: https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L35
export type GetCacheKeyFunction = (
  sourceText: string,
  sourcePath: string,
  options: CacheKeyOptions
) => string;

// See: https://github.com/facebook/jest/blob/3093c18c428d962eb959437b322c6a5b0ae0e7a2/packages/jest-config/src/utils.ts#L14
export interface IResolveOptions {
  rootDir: string;
  key: string;
  filePath: string;
  optional?: boolean;
}

// Adapted from Jest to expose non-exported resolve function
// See: https://github.com/facebook/jest/blob/3093c18c428d962eb959437b322c6a5b0ae0e7a2/packages/jest-config/src/utils.ts#L58
export const replaceRootDirInPath = (rootDir: string, filePath: string): string => {
  if (!/^<rootDir>/.test(filePath)) {
    return filePath;
  }

  return path.resolve(rootDir, `./${filePath.substring('<rootDir>'.length)}`);
};

// Adapted from Jest to expose non-exported resolve function.
// See: https://github.com/facebook/jest/blob/3093c18c428d962eb959437b322c6a5b0ae0e7a2/packages/jest-config/src/utils.ts#L31
export const jestResolve = (
  // eslint-disable-next-line @rushstack/no-new-null
  resolver: string | null | undefined,
  options: IResolveOptions
  // eslint-disable-next-line @rushstack/no-new-null
): string | null => {
  const { key, filePath, rootDir, optional } = options;
  const module: string | null = JestResolver.findNodeModule(replaceRootDirInPath(rootDir, filePath), {
    basedir: rootDir,
    resolver: resolver || undefined
  });

  if (!module && !optional) {
    throw new Error(`The ${key} option was not found. '<rootDir> is: ${rootDir}`);
  }
  return module;
};

// <serialized inputs> -> <global cache key>
// NOTE: Assumes that the content of these serialized inputs are constant.
const globalCacheKeyStore: Map<string, string> = new Map();

// Adapted from @jest/create-cache-key-function to add memoization and support for async I/O.
// See: https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L43
const getGlobalCacheKey = (files: string[], values: string[]): string => {
  const components: (string | undefined)[] = [
    process.env.NODE_ENV,
    process.env.BABEL_ENV,
    ...values,
    ...files
  ];
  const serializedComponents: string = JSON.stringify(components);
  const existingGlobalCacheKey: string | undefined = globalCacheKeyStore.get(serializedComponents);
  if (existingGlobalCacheKey) {
    return existingGlobalCacheKey;
  }

  const generatedGlobalCacheKey: string = [
    process.env.NODE_ENV,
    process.env.BABEL_ENV,
    ...values,
    ...files.map((file: string) => FileSystem.readFile(file))
  ]
    .reduce((hash, chunk) => hash.update('\0', 'utf8').update(chunk || ''), createHash('md5'))
    .digest('hex');
  globalCacheKeyStore.set(serializedComponents, generatedGlobalCacheKey);
  return generatedGlobalCacheKey;
};

// Adapted from @jest/create-cache-key-function to add memoization and support for async I/O.
// See: https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L43
const getGlobalCacheKeyAsync = async (files: string[], values: string[]): Promise<string> => {
  const components: (string | undefined)[] = [
    process.env.NODE_ENV,
    process.env.BABEL_ENV,
    ...values,
    ...files
  ];
  const serializedComponents: string = JSON.stringify(components);
  const existingGlobalCacheKey: string | undefined = globalCacheKeyStore.get(serializedComponents);
  if (existingGlobalCacheKey) {
    return existingGlobalCacheKey;
  }

  const generatedGlobalCacheKey: string = [
    process.env.NODE_ENV,
    process.env.BABEL_ENV,
    ...values,
    ...(await Promise.all(files.map((file: string) => FileSystem.readFileAsync(file))))
  ]
    .reduce((hash, chunk) => hash.update('\0', 'utf8').update(chunk || ''), createHash('md5'))
    .digest('hex');
  globalCacheKeyStore.set(serializedComponents, generatedGlobalCacheKey);
  return generatedGlobalCacheKey;
};

// See: https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L57
const createCacheKeyFunctionInternal = (globalCacheKey: string): GetCacheKeyFunction => {
  return (sourceText: string, sourcePath: string, options: CacheKeyOptions): string => {
    const { config, instrument } = options;
    return createHash('md5')
      .update(globalCacheKey)
      .update('\0', 'utf8')
      .update(sourceText)
      .update('\0', 'utf8')
      .update(config.rootDir ? path.relative(config.rootDir, sourcePath) : '')
      .update('\0', 'utf8')
      .update(instrument ? 'instrument' : '')
      .digest('hex');
  };
};

// Adapted from @jest/create-cache-key-function to add memoization and support for async I/O.
// https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L57
export const createCacheKeyFunction = (files: string[], values: string[]): GetCacheKeyFunction => {
  const globalCacheKey: string = getGlobalCacheKey(files, values);
  return createCacheKeyFunctionInternal(globalCacheKey);
};

// Adapted from @jest/create-cache-key-function to add memoization and support for async I/O.
// https://github.com/facebook/jest/blob/86e64611c98dd3a6656be27dc5c342d53f8e7c30/packages/jest-create-cache-key-function/src/index.ts#L57
export const createCacheKeyFunctionAsync = async (
  files: string[],
  values: string[]
): Promise<GetCacheKeyFunction> => {
  const globalCacheKey: string = await getGlobalCacheKeyAsync(files, values);
  return createCacheKeyFunctionInternal(globalCacheKey);
};
