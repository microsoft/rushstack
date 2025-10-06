// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { existsSync } from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

import type { INpmCheckState } from './interfaces/INpmCheck';

/**
 * Searches the directory hierarchy to return the path to the requested node module.
 * If the module can't be found, returns the initial (deepest) tried path.
 */
export default function findModulePath(moduleName: string, currentState: INpmCheckState): string {
  const cwd: string = currentState.cwd;

  // Module._nodeModulePaths does not include some places the node module resolver searches, such as
  // the global prefix or other special directories. This is desirable because if a module is missing
  // in the project directory we want to be sure to report it as missing.
  // We can't use require.resolve because it fails if the module doesn't have an entry point.
  // @ts-ignore
  const nodeModulesPaths: string[] = Module._nodeModulePaths(cwd);
  const possibleModulePaths: string[] = nodeModulesPaths.map((x) => path.join(x, moduleName));
  const modulePath: string | undefined = possibleModulePaths.find((p) => existsSync(p));
  // if no existing path was found, return the first tried path anyway
  return modulePath || path.join(cwd, moduleName);
}
