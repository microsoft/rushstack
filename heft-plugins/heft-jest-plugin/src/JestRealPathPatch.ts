// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RealNodeModulePathResolver } from '@rushstack/node-core-library/lib/RealNodeModulePath';
import type { IPackageJson } from '@rushstack/node-core-library';

const jestResolvePackageFolder: string = path.dirname(require.resolve('jest-resolve/package.json'));

const jestUtilPackageFolder: string = path.dirname(
  require.resolve('jest-util/package.json', { paths: [jestResolvePackageFolder] })
);

const { realNodeModulePath }: RealNodeModulePathResolver = new RealNodeModulePathResolver();

const customTryRealpath = (input: string): string => {
  try {
    return realNodeModulePath(input);
  } catch (error) {
    // Not using the helper from FileSystem here because this code loads in every Jest worker process
    // and FileSystem has a lot of extra dependencies
    // These error codes cloned from the logic in jest-util's tryRealpath.js
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
      throw error;
    }
  }
  return input;
};

const jestUtilPackageJson: IPackageJson = require(path.join(`${jestUtilPackageFolder}/package.json`));
const jestUtilMajorVersion: number = parseInt(jestUtilPackageJson.version, 10);

if (jestUtilMajorVersion >= 30) {
  // jest-util 30+: everything is bundled in index.js.
  // tryRealpath is exported as a non-configurable getter, so we can't set it directly.
  // Instead, replace the require-cache entry with an object that shadows the getter.
  const jestUtilIndexPath: string = require.resolve('jest-util', {
    paths: [jestResolvePackageFolder]
  });
  const jestUtilExports: object = require(jestUtilIndexPath);
  const patchedExports: object = Object.create(jestUtilExports);
  Object.defineProperty(patchedExports, 'tryRealpath', {
    value: customTryRealpath,
    writable: true,
    enumerable: true,
    configurable: true
  });
  require.cache[jestUtilIndexPath]!.exports = patchedExports;
} else {
  // jest-util < 30: tryRealpath is a standalone module; replace its default export.
  const jestUtilTryRealpathPath: string = `${jestUtilPackageFolder}/build/tryRealpath.js`;
  const tryRealpathModule: {
    default: (filePath: string) => string;
  } = require(jestUtilTryRealpathPath);
  tryRealpathModule.default = customTryRealpath;
}
