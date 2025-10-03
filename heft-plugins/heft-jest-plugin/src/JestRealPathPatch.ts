// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RealNodeModulePathResolver } from '@rushstack/node-core-library/lib/RealNodeModulePath';

const jestResolvePackageFolder: string = path.dirname(require.resolve('jest-resolve/package.json'));

const jestUtilPackageFolder: string = path.dirname(
  require.resolve('jest-util/package.json', { paths: [jestResolvePackageFolder] })
);
const jestUtilTryRealpathPath: string = path.resolve(jestUtilPackageFolder, './build/tryRealpath.js');

const { realNodeModulePath }: RealNodeModulePathResolver = new RealNodeModulePathResolver();

const tryRealpathModule: {
  default: (filePath: string) => string;
} = require(jestUtilTryRealpathPath);
tryRealpathModule.default = (input: string): string => {
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
