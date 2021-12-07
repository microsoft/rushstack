// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { default as JestResolver } from 'jest-resolve';
import type { Config } from '@jest/types';

// See: https://github.com/facebook/jest/blob/3093c18c428d962eb959437b322c6a5b0ae0e7a2/packages/jest-config/src/utils.ts#L14
export interface IResolveOptions {
  rootDir: Config.Path;
  key: string;
  filePath: Config.Path;
  optional?: boolean;
}

// See: https://github.com/facebook/jest/blob/3093c18c428d962eb959437b322c6a5b0ae0e7a2/packages/jest-config/src/utils.ts#L58
export const replaceRootDirInPath = (rootDir: Config.Path, filePath: Config.Path): string => {
  if (!/^<rootDir>/.test(filePath)) {
    return filePath;
  }

  return path.resolve(rootDir, path.normalize('./' + filePath.substring('<rootDir>'.length)));
};

// See: https://github.com/facebook/jest/blob/3093c18c428d962eb959437b322c6a5b0ae0e7a2/packages/jest-config/src/utils.ts#L31
export const jestResolve = (
  // eslint-disable-next-line @rushstack/no-new-null
  resolver: string | null | undefined,
  options: IResolveOptions
): string => {
  const { key, filePath, rootDir, optional } = options;
  const module: string | null = JestResolver.findNodeModule(replaceRootDirInPath(rootDir, filePath), {
    basedir: rootDir,
    resolver: resolver || undefined
  });

  if (!module && !optional) {
    throw new Error(`The ${key} option was not found. '<rootDir> is: ${rootDir}`);
  }
  /// can cast as string since nulls will be thrown
  return module as string;
};
