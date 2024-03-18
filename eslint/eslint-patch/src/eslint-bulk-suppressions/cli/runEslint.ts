// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ESLint } from 'eslint';
import { getEslintPath } from './utils/get-eslint-cli';

export async function runEslintAsync(files: string[], mode: 'suppress' | 'prune'): Promise<void> {
  const eslintPath: string = getEslintPath(process.cwd());
  const { ESLint }: typeof import('eslint') = require(eslintPath);
  const eslint: ESLint = new ESLint({
    useEslintrc: true,
    cwd: process.cwd()
  });

  let results: ESLint.LintResult[];
  try {
    results = await eslint.lintFiles(files);
  } catch (e) {
    throw new Error(`@rushstack/eslint-bulk execution error: ${e.message}`);
  }

  const { write, prune } = await import('../bulk-suppressions-patch');
  switch (mode) {
    case 'suppress': {
      await write();
      break;
    }

    case 'prune': {
      await prune();
      break;
    }
  }

  const stylishFormatter: ESLint.Formatter = await eslint.loadFormatter();
  const formattedResults: string = stylishFormatter.format(results);
  if (formattedResults) {
    console.log(formattedResults);
    throw new Error(`@rushstack/eslint-bulk ESLint errors`);
  } else {
    console.log(
      `@rushstack/eslint-bulk: Successfully pruned unused suppressions in all .eslint-bulk-suppressions.json files under directory ${process.cwd()}`
    );
  }
}
