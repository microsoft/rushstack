// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import os from 'node:os';

import { eslintFolder, eslintPackageVersion } from '../_patch-base';
import { ESLINT_BULK_DETECT_ENV_VAR_NAME } from './constants';
import currentPackageJson from '../../package.json';

interface IConfiguration {
  minCliVersion: string;
  cliEntryPoint: string;
}

const CURRENT_PACKAGE_VERSION: string = currentPackageJson.version;

export function findAndConsoleLogPatchPathCli(): void {
  const eslintBulkDetectEnvVarValue: string | undefined = process.env[ESLINT_BULK_DETECT_ENV_VAR_NAME];
  if (eslintBulkDetectEnvVarValue !== 'true' && eslintBulkDetectEnvVarValue !== '1') {
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
    cliEntryPoint: require.resolve('../exports/eslint-bulk')
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
  const patchesFolderPath: string = `${os.tmpdir()}/rushstack-eslint-bulk-${CURRENT_PACKAGE_VERSION}/patches`;
  fs.mkdirSync(patchesFolderPath, { recursive: true });
  const pathToGeneratedPatch: string = `${patchesFolderPath}/linter-patch-v${eslintPackageVersion}.js`;
  return pathToGeneratedPatch;
}
