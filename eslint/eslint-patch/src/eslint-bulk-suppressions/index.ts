// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { eslintFolder } from '../_patch-base';
import { findAndConsoleLogPatchPathCli, getPathToLinterJS, ensurePathToGeneratedPatch } from './path-utils';
import { patchLinter } from './bulk-suppressions-patch';
import { generatePatchedLinterJsFileIfDoesNotExist } from './generate-patched-file';
import { ESLINT_BULK_DETECT_ENV_VAR_NAME, ESLINT_BULK_PATCH_PATH_ENV_VAR_NAME } from './constants';

if (!eslintFolder) {
  console.error(
    '@rushstack/eslint-patch/eslint-bulk-suppressions: Could not find ESLint installation to patch.'
  );

  process.exit(1);
}

const eslintBulkDetectEnvVarValue: string | undefined = process.env[ESLINT_BULK_DETECT_ENV_VAR_NAME];
if (eslintBulkDetectEnvVarValue === 'true' || eslintBulkDetectEnvVarValue === '1') {
  findAndConsoleLogPatchPathCli();
  process.exit(0);
}

const pathToLinterJS: string = getPathToLinterJS();

process.env[ESLINT_BULK_PATCH_PATH_ENV_VAR_NAME] = require.resolve('./bulk-suppressions-patch');

const pathToGeneratedPatch: string = ensurePathToGeneratedPatch();
generatePatchedLinterJsFileIfDoesNotExist(pathToLinterJS, pathToGeneratedPatch);

const { Linter: LinterPatch } = require(pathToGeneratedPatch);

const { Linter, getLinterInternalSlots } = require(pathToLinterJS);

patchLinter(Linter, LinterPatch, getLinterInternalSlots);
