// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as path from 'path';
import { Import } from '@rushstack/node-core-library';

/* eslint-disable @typescript-eslint/no-explicit-any */

console.log('Patching Jest');

// Follow the NPM dependency chain:
// heft --> @jest/core --> @jest/reporters --> jest-worker
let contextFolder: string = __dirname;
contextFolder = Import.resolvePackage({ packageName: '@jest/core', baseFolderPath: contextFolder });
contextFolder = Import.resolvePackage({ packageName: '@jest/reporters', baseFolderPath: contextFolder });
const jestWorkerFolder: string = Import.resolvePackage({
  packageName: 'jest-worker',
  baseFolderPath: contextFolder
});

const baseWorkerPoolPath: string = path.join(jestWorkerFolder, 'build/base/BaseWorkerPool.js');

const baseWorkerPoolModule: any = require(baseWorkerPoolPath);

const baseWorkerPoolModuleMetadata: any = module.children[module.children.length - 1];

if (
  !baseWorkerPoolModuleMetadata ||
  path.basename(baseWorkerPoolModuleMetadata.filename) !== path.basename(baseWorkerPoolPath)
) {
  throw new Error('oops');
}

const fileContent: string = fs.readFileSync(baseWorkerPoolPath).toString();
let evalContent: string =
  '// PATCHED BY HEFT USING eval()\n\nexports = {}\n' + fileContent + '\n// return value:\nexports';

evalContent = evalContent.replace('FORCE_EXIT_DELAY = 0', 'FORCE_EXIT_DELAY = 10000');

function evalInContext(): void {
  // Remap the require() function for the eval() context
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function require(modulePath: string): void {
    return baseWorkerPoolModuleMetadata.require(modulePath);
  }

  // eslint-disable-next-line no-eval
  return eval(evalContent);
}

const patchedModule: any = evalInContext();

baseWorkerPoolModule.default = patchedModule.default;

console.log('Patched Jest');
