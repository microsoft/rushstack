// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This module is loaded by bin/heft before anything else, so it intentionally only uses Node.js built-in modules
// (named imports avoid the interop helpers).
import { mkdirSync } from 'node:fs';
import nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface IModuleCompileCacheApi {
  enableCompileCache?: () => unknown;
  getCompileCacheDir?: () => string | undefined;
}

/**
 * Enables the V8 compile cache for the current process (Node.js >= 22.8), like `module.enableCompileCache()`:
 * the cache folder is NODE_COMPILE_CACHE if set, otherwise `<os.tmpdir()>/node-compile-cache`, and
 * NODE_DISABLE_COMPILE_CACHE disables it. Never throws; failures just leave the compile cache disabled.
 *
 * @returns the compile cache folder, or undefined if the compile cache is not enabled
 */
export function tryEnableCompileCache(): string | undefined {
  try {
    const compileCacheApi: IModuleCompileCacheApi = nodeModule as IModuleCompileCacheApi;
    if (typeof compileCacheApi.enableCompileCache !== 'function') {
      return undefined;
    }
    const env: NodeJS.ProcessEnv = process.env;
    if (env.NODE_DISABLE_COMPILE_CACHE !== undefined) {
      return undefined;
    }
    if (!env.NODE_COMPILE_CACHE) {
      // Make sure that the default cache folder can be created with a single mkdir, because Node.js' recursive
      // folder creation never returns for some unusable locations (e.g. TMPDIR pointing into /proc).
      try {
        mkdirSync(join(tmpdir(), 'node-compile-cache'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          return undefined;
        }
      }
    }
    compileCacheApi.enableCompileCache();
    return compileCacheApi.getCompileCacheDir?.();
  } catch {
    return undefined;
  }
}
