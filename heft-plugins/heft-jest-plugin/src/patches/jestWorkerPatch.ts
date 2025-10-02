// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

import * as path from 'node:path';
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

    const baseWorkerPoolPath: string = path.join(jestWorkerFolder, 'build/base/BaseWorkerPool.js');
    const baseWorkerPoolFilename: string = path.basename(baseWorkerPoolPath); // BaseWorkerPool.js

    if (!FileSystem.exists(baseWorkerPoolPath)) {
      throw new Error(
        'The BaseWorkerPool.js file was not found in the expected location:\n' + baseWorkerPoolPath
      );
    }

    // Load the module
    const baseWorkerPoolModule: IBaseWorkerPoolModule = require(baseWorkerPoolPath);

    // Obtain the metadata for the module
    let baseWorkerPoolModuleMetadata: NodeModule | undefined = undefined;
    for (const childModule of module.children) {
      if (path.basename(childModule.filename || '').toUpperCase() === baseWorkerPoolFilename.toUpperCase()) {
        if (baseWorkerPoolModuleMetadata) {
          throw new Error('More than one child module matched while detecting Node.js module metadata');
        }
        baseWorkerPoolModuleMetadata = childModule;
      }
    }

    if (!baseWorkerPoolModuleMetadata) {
      throw new Error('Failed to detect the Node.js module metadata for BaseWorkerPool.js');
    }

    // Load the original file contents
    const originalFileContent: string = FileSystem.readFile(baseWorkerPoolPath);

    // Add boilerplate so that eval() will return the exports
    let patchedCode: string =
      '// PATCHED BY HEFT USING eval()\n\nexports = {}\n' +
      originalFileContent +
      '\n// return value:\nexports';

    // Apply the patch.  We will replace this:
    //
    //    const FORCE_EXIT_DELAY = 500;
    //
    // with this:
    //
    //    const FORCE_EXIT_DELAY = 7000;
    let matched: boolean = false;
    patchedCode = patchedCode.replace(
      /(const\s+FORCE_EXIT_DELAY\s*=\s*)(\d+)(\s*\;)/,
      (matchedString: string, leftPart: string, middlePart: string, rightPart: string): string => {
        matched = true;
        return leftPart + PATCHED_FORCE_EXIT_DELAY.toString() + rightPart;
      }
    );

    if (!matched) {
      throw new Error('The expected pattern was not found in the file:\n' + baseWorkerPoolPath);
    }

    function evalInContext(): IBaseWorkerPoolModule {
      // Remap the require() function for the eval() context

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      function require(modulePath: string): void {
        return baseWorkerPoolModuleMetadata!.require(modulePath);
      }

      // eslint-disable-next-line no-eval
      return eval(patchedCode);
    }

    const patchedModule: IBaseWorkerPoolModule = evalInContext();

    baseWorkerPoolModule.default = patchedModule.default;
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
