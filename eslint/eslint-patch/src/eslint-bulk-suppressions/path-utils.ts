// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { eslintFolder } from '../_patch-base';
import { ESLINT_BULK_DETECT_ENV_VAR_NAME } from './constants';

interface IConfiguration {
  minCliVersion: string;
  cliEntryPoint: string;
}

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

export interface IPathsToPatch {
  linterPath: string;
  traverserPath: string;
}

export function getPathsToPatch(): IPathsToPatch {
  if (!eslintFolder) {
    throw new Error('Cannot find ESLint installation to patch.');
  }

  return {
    linterPath: `${eslintFolder}/lib/linter/linter.js`,
    traverserPath: `${eslintFolder}/lib/shared/traverser.js`
  };
}
