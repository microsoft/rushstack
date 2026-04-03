// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

import * as path from 'node:path';
import { createRequire } from 'node:module';

import { Import, FileSystem } from '@rushstack/node-core-library';

// This patch is a fix for a problem where Jest reports this error spuriously on a machine that is under heavy load:
//
// "A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests
// leaking due to improper teardown. Try running with --runInBand --detectOpenHandles to find leaks."
//
// The upstream issue is here: https://github.com/facebook/jest/issues/11354
//
// The relevant code is in jest-worker/src/base/BaseWorkerPool.ts:
// https://github.com/facebook/jest/blob/64d5983d20a628d68644a3a4cd0f510dc304805a/packages/jest-worker/src/base/BaseWorkerPool.ts#L110
//
//      // Schedule a force exit in case worker fails to exit gracefully so
//      // await worker.waitForExit() never takes longer than FORCE_EXIT_DELAY
//      let forceExited = false;
//      const forceExitTimeout = setTimeout(() => {
//        worker.forceExit();
//        forceExited = true;
//      }, FORCE_EXIT_DELAY);
//
// The problem is that Jest hardwires FORCE_EXIT_DELAY to be 500 ms.  On a machine that is under heavy load,
// the IPC message is not received from the child process before the timeout elapses.  The mitigation is to
// increase the delay.  (Jest itself seems to be a significant contributor to machine load, so perhaps reducing
// Jest's parallelism could also help.)

interface IBaseWorkerPoolModule {
  default: unknown;
}

// Follow the NPM dependency chain to find the module path for BaseWorkerPool.js
// heft --> @jest/core --> @jest/reporters --> jest-worker

const PATCHED_FORCE_EXIT_DELAY: number = 7000; // 7 seconds
const patchName: string = path.basename(__filename);

function applyPatch(): void {
  try {
    let contextFolder: string = __dirname;
    // Resolve the "@jest/core" package relative to Heft
    contextFolder = Import.resolvePackage({
      packageName: '@jest/core',
      baseFolderPath: contextFolder,
      useNodeJSResolver: true
    });
    // Resolve the "@jest/reporters" package relative to "@jest/core"
    contextFolder = Import.resolvePackage({
      packageName: '@jest/reporters',
      baseFolderPath: contextFolder,
      useNodeJSResolver: true
    });
    // Resolve the "jest-worker" package relative to "@jest/reporters"
    const jestWorkerFolder: string = Import.resolvePackage({
      packageName: 'jest-worker',
      baseFolderPath: contextFolder,
      useNodeJSResolver: true
    });

    // jest-worker 30.x switched to a webpack-bundled single-file architecture.
    // For 29.x and earlier, patch build/base/BaseWorkerPool.js directly.
    // For 30.x and later, patch build/index.js (the webpack bundle).
    const jestWorkerPackageJson: { version: string } = require(path.join(jestWorkerFolder, 'package.json'));
    const jestWorkerMajorVersion: number = parseInt(jestWorkerPackageJson.version.split('.')[0], 10);
    const isBundled: boolean = jestWorkerMajorVersion >= 30;

    const targetPath: string = isBundled
      ? path.join(jestWorkerFolder, 'build/index.js')
      : path.join(jestWorkerFolder, 'build/base/BaseWorkerPool.js');

    if (!FileSystem.exists(targetPath)) {
      throw new Error(
        `The ${path.basename(targetPath)} file was not found in the expected location:\n` + targetPath
      );
    }

    // Load the module
    const targetModule: IBaseWorkerPoolModule = require(targetPath);

    // Obtain the metadata for the module
    let targetModuleMetadata: NodeModule | undefined = undefined;
    for (const childModule of module.children) {
      // Match by full path to avoid false positives (e.g. many modules named index.js)
      if (childModule.filename === targetPath) {
        if (targetModuleMetadata) {
          throw new Error('More than one child module matched while detecting Node.js module metadata');
        }
        targetModuleMetadata = childModule;
      }
    }

    if (!targetModuleMetadata) {
      throw new Error(`Failed to detect the Node.js module metadata for ${path.basename(targetPath)}`);
    }

    // Load the original file contents
    const originalFileContent: string = FileSystem.readFile(targetPath);

    // Apply the patch.  We will replace this:
    //
    //    const FORCE_EXIT_DELAY = 500;
    //
    // with this:
    //
    //    const FORCE_EXIT_DELAY = 7000;
    let matched: boolean = false;
    const patchedCode: string = originalFileContent.replace(
      /(const\s+FORCE_EXIT_DELAY\s*=\s*)(\d+)(\s*\;)/,
      (matchedString: string, leftPart: string, middlePart: string, rightPart: string): string => {
        matched = true;
        return leftPart + PATCHED_FORCE_EXIT_DELAY.toString() + rightPart;
      }
    );

    if (!matched) {
      throw new Error('The expected pattern was not found in the file:\n' + targetPath);
    }

    if (isBundled) {
      // jest-worker 30.x: webpack bundle uses `module.exports = __webpack_exports__` at the top level.
      // Shadow `module` with a shim so that assignment writes to our object, then copy the
      // resulting exports over the already-cached module exports in-place.
      function evalInContextBundled(): Record<string, unknown> {
        // createRequire(targetPath) produces a proper require function with resolve/cache/etc.
        // and the right module-resolution context (resolves relative to jest-worker's build dir).
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const require: NodeRequire = createRequire(targetPath);
        // Shadow `module` so the bundle's `module.exports = ...` writes to our shim
        const module: { exports: Record<string, unknown> } = { exports: {} };
        // eslint-disable-next-line no-eval
        eval(patchedCode);
        return module.exports;
      }

      const patchedExports: Record<string, unknown> = evalInContextBundled();
      // Can't mutate the cached exports in-place (webpack defines them as read-only getters).
      // Replace the exports object in the require cache entirely so future require() calls
      // return the patched version.
      require.cache[targetModuleMetadata.filename]!.exports = patchedExports;
    } else {
      // jest-worker < 30: BaseWorkerPool.js uses bare `exports`, wrap for eval return value
      const wrappedCode: string =
        '// PATCHED BY HEFT USING eval()\n\nexports = {}\n' + patchedCode + '\n// return value:\nexports';

      function evalInContext(): IBaseWorkerPoolModule {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        function require(modulePath: string): void {
          return targetModuleMetadata!.require(modulePath);
        }
        // eslint-disable-next-line no-eval
        return eval(wrappedCode);
      }

      const patchedModule: IBaseWorkerPoolModule = evalInContext();
      targetModule.default = patchedModule.default;
    }
  } catch (e) {
    console.error();
    console.error(`ERROR: ${patchName} failed to patch the "jest-worker" package:`);
    console.error((e as Error).toString());
    console.error();

    throw e;
  }
}

if (typeof jest !== 'undefined' || process.env.JEST_WORKER_ID) {
  // This patch is incompatible with Jest's proprietary require() implementation
  console.log(`\nJEST ENVIRONMENT DETECTED - Skipping Heft's ${patchName}\n`);
} else {
  applyPatch();
}
