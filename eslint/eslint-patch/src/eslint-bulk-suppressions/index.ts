// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { eslintFolder } from '../_patch-base';
import { findAndConsoleLogPatchPathCli, getPathsToPatch } from './path-utils';
import { extendVerifyFunction, type ITraverser } from './bulk-suppressions-patch';
import { ESLINT_BULK_DETECT_ENV_VAR_NAME, ESLINT_BULK_ENABLE_ENV_VAR_NAME } from './constants';

function apply(): void {
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

  if (process.env[ESLINT_BULK_ENABLE_ENV_VAR_NAME] === 'false') {
    return;
  }

  const { linterPath, traverserPath } = getPathsToPatch();

  const { Linter, getLinterInternalSlots } = require(linterPath);
  const Traverser: ITraverser = require(traverserPath);
  const { verify: originalVerify } = Linter.prototype;
  Linter.prototype.verify = extendVerifyFunction(originalVerify, getLinterInternalSlots, Traverser);
}

apply();
