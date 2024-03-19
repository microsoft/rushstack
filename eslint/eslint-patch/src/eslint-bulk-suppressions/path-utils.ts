// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';
import os from 'os';
import { eslintFolder, eslintPackageVersion } from '../_patch-base';
import { eslintBulkPath } from '../exports/eslint-bulk';

interface IConfiguration {
  minCliVersion: string;
  cliEntryPoint: string;
}

export function findAndConsoleLogPatchPathCli(): void {
  if (process.env._RUSHSTACK_ESLINT_BULK_DETECT !== 'true') {
    return;
  }

  const startDelimiter: string = 'RUSHSTACK_ESLINT_BULK_START';
  const endDelimiter: string = 'RUSHSTACK_ESLINT_BULK_END';

  const configuration: IConfiguration = {
    /**
     * `@rushstack/eslint-bulk` should report an error if its package.json is older than this number
     */
    minCliVersion: '0.0.0',
    /**
     * `@rushstack/eslint-bulk` will invoke this entry point
     */
    cliEntryPoint: eslintBulkPath
  };

  console.log(startDelimiter + JSON.stringify(configuration) + endDelimiter);
}

export function getPathToLinterJS(): string {
  if (!eslintFolder) {
    throw new Error('Cannot find ESLint installation to patch.');
  }

  return `${eslintFolder}/lib/linter/linter.js`;
}

export function ensurePathToGeneratedPatch(): string {
  const patchesFolderPath: string = `${os.tmpdir()}/rushstack-eslint-bulk/patches`;
  fs.mkdirSync(patchesFolderPath, { recursive: true });
  const pathToGeneratedPatch: string = `${patchesFolderPath}/linter-patch-v${eslintPackageVersion}.js`;
  return pathToGeneratedPatch;
}
