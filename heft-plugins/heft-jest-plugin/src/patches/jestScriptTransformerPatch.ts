// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Import, FileSystem } from '@rushstack/node-core-library';

// This patch is a fix for a problem where Jest fails to rename the cache file on a machine that is under heavy load:
//
// "failed to cache transform results in: <jestCachePath>/jest-transform-cache-*/...
// Failure message: EPERM: operation not permitted, rename
//   '<jestCachePath/jest-transform-cache-*/...' -> '<jestCachePath>/jest-transform-cache-*/...'"
//
// The upstream issue is here: https://github.com/facebook/jest/issues/4444
//
// The relevant code is in jest-transform/src/ScriptTransformer.ts:
// https://github.com/facebook/jest/blob/835a93666a69202de2a0429cd5445cb5f56d2cea/packages/jest-transform/src/ScriptTransformer.ts#L932
//
// The problem is that Jest encounters a race condition on Windows where the cache file has already been renamed by
// another worker process. This only occurs because Windows does not support atomic writes, which are used on other
// platforms. The fix is to wait for the rename to complete, instead of failing if the renamed file isn't immediately
// available.

interface IScriptTransformerModule {
  createScriptTransformer: unknown;
  createTranspilingRequire: unknown;
}

const patchName: string = path.basename(__filename);

function applyPatch(): void {
  try {
    // Resolve the ScriptTransformer module in the "@jest/transform" package relative to the
    // heft-jest-plugin package
    const scriptTransformerFilePath: string = Import.resolveModule({
      modulePath: '@jest/transform/build/ScriptTransformer',
      baseFolderPath: __dirname
    });
    const scriptTransformerFilename: string = path.basename(scriptTransformerFilePath); // ScriptTransformer.js

    // Load the module
    const scriptTransformerModule: IScriptTransformerModule = require(scriptTransformerFilePath);

    // Obtain the metadata for the module
    let scriptTransformerModuleMetadata: NodeModule | undefined = undefined;
    for (const childModule of module.children) {
      if (
        path.basename(childModule.filename || '').toUpperCase() === scriptTransformerFilename.toUpperCase()
      ) {
        if (scriptTransformerModuleMetadata) {
          throw new Error('More than one child module matched while detecting Node.js module metadata');
        }
        scriptTransformerModuleMetadata = childModule;
      }
    }

    // Load the original file contents
    const originalFileContent: string = FileSystem.readFile(scriptTransformerFilePath);

    // Add boilerplate so that eval() will return the exports
    let patchedCode: string =
      '// PATCHED BY HEFT USING eval()\n\nexports = {}\n' +
      originalFileContent +
      '\n// return value:\nexports';

    // Patch the file contents
    patchedCode = patchWriteCacheFileFn(scriptTransformerFilePath, patchedCode);

    function evalInContext(): IScriptTransformerModule {
      // Remap the require() function for the eval() context

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      function require(modulePath: string): void {
        return scriptTransformerModuleMetadata!.require(modulePath);
      }

      // eslint-disable-next-line no-eval
      return eval(patchedCode);
    }

    const patchedModule: IScriptTransformerModule = evalInContext();
    scriptTransformerModule.createScriptTransformer = patchedModule.createScriptTransformer;
    scriptTransformerModule.createTranspilingRequire = patchedModule.createTranspilingRequire;
  } catch (e) {
    console.error();
    console.error(`ERROR: ${patchName} failed to patch the "@jest/transform" package:`);
    console.error((e as Error).toString());
    console.error();

    throw e;
  }
}

function patchWriteCacheFileFn(scriptPath: string, scriptContent: string): string {
  // This patch is going to be very specific to the version of Jest that we are using.
  // This is intentional, because we want to make sure that we don't accidentally break
  // future versions of Jest that might have a different implementation.
  //
  // We will replace the existing implementation of the method to wait for the rename
  // to complete.
  let matched: boolean = false;
  scriptContent.replace(/\s*const cacheWriteErrorSafeToIgnore = \(e, cachePath\) =>[^;]+;/, () => {
    matched = true;
    return (
      '' +
      'const cacheWriteErrorSafeToIgnore = (e, cachePath) => {\n' +
      "  if (process.platform !== 'win32' || e.code !== 'EPERM') {\n" +
      '    return false;\n' +
      '  }\n' +
      '  do {} while (!fs().existsSync(cachePath));\n' +
      '  return true;\n' +
      '};'
    );
  });
  if (!matched) {
    throw new Error(
      `The "cacheWriteErrorSafeToIgnore" function was not found in the file ${JSON.stringify(scriptPath)}`
    );
  }
  return scriptContent;
}

if (typeof jest !== 'undefined' || process.env.JEST_WORKER_ID) {
  // This patch is incompatible with Jest's proprietary require() implementation
  console.log(`\nJEST ENVIRONMENT DETECTED - Skipping Heft's ${patchName}\n`);
} else {
  applyPatch();
}
