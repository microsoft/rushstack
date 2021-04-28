// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as path from 'path';
import { Import } from '@rushstack/node-core-library';

// This patch is a fix for this code from jest-worker/src/base/BaseWorkerPool.ts:
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
// The problem is that Jest hardwires FORCE_EXIT_DELAY to be 500 ms, which causes spurious failures on a
// machine that is under heavy load.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BaseWorkerPoolModule = any;

// Follow the NPM dependency chain to find the module path for BaseWorkerPool.js
// heft --> @jest/core --> @jest/reporters --> jest-worker

const PATCHED_FORCE_EXIT_DELAY: number = 10000; // milliseconds

try {
  let contextFolder: string = __dirname;
  contextFolder = Import.resolvePackage({ packageName: '@jest/core', baseFolderPath: contextFolder });
  contextFolder = Import.resolvePackage({ packageName: '@jest/reporters', baseFolderPath: contextFolder });
  const jestWorkerFolder: string = Import.resolvePackage({
    packageName: 'jest-worker',
    baseFolderPath: contextFolder
  });

  const baseWorkerPoolPath: string = path.join(jestWorkerFolder, 'build/base/BaseWorkerPool.js');

  if (!fs.existsSync(baseWorkerPoolPath)) {
    throw new Error(
      'The BaseWorkerPool.js file was not found in the expected location:\n' + baseWorkerPoolPath
    );
  }

  // Load the module
  const baseWorkerPoolModule: BaseWorkerPoolModule = require(baseWorkerPoolPath);

  // Obtain the metadata for the module
  const baseWorkerPoolModuleMetadata: NodeModule = module.children[module.children.length - 1];

  if (
    !baseWorkerPoolModuleMetadata ||
    path.basename(baseWorkerPoolModuleMetadata.filename) !== path.basename(baseWorkerPoolPath)
  ) {
    throw new Error('Failed to detect the Node.js module metadata for BaseWorkerPool.js');
  }

  // Load the original file contents
  const originalFileContent: string = fs.readFileSync(baseWorkerPoolPath).toString();

  // Add boilerplate so that eval() will return the exports
  let patchedCode: string =
    '// PATCHED BY HEFT USING eval()\n\nexports = {}\n' + originalFileContent + '\n// return value:\nexports';

  // Apply the patch.  We will replace this:
  //
  //    const FORCE_EXIT_DELAY = 500;
  //
  // with this:
  //
  //    const FORCE_EXIT_DELAY = 10000;
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

  function evalInContext(): void {
    // Remap the require() function for the eval() context

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function require(modulePath: string): void {
      return baseWorkerPoolModuleMetadata.require(modulePath);
    }

    // eslint-disable-next-line no-eval
    return eval(patchedCode);
  }

  const patchedModule: BaseWorkerPoolModule = evalInContext();

  baseWorkerPoolModule.default = patchedModule.default;
} catch (e) {
  console.error();
  console.error('ERROR: jest-worker-patch.ts failed to patch the "jest-worker" package:');
  console.error(e.toString());
  console.error();

  throw e;
}
