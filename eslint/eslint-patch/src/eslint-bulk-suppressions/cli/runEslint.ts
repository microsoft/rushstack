// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ESLint as TEslintLegacy } from 'eslint-8';
import type { ESLint as TEslint } from 'eslint-9';

import { getEslintPathAndVersion } from './utils/get-eslint-cli.ts';

export async function runEslintAsync(files: string[], mode: 'suppress' | 'prune'): Promise<void> {
  const cwd: string = process.cwd();
  const [eslintPath, eslintVersion] = getEslintPathAndVersion(cwd);
  const { ESLint }: typeof import('eslint-9') | typeof import('eslint-8') = require(eslintPath);

  let eslint: TEslint | TEslintLegacy;
  const majorVersion: number = parseInt(eslintVersion, 10);
  if (majorVersion < 9) {
    eslint = new ESLint({ cwd, useEslintrc: true });
  } else {
    eslint = new ESLint({ cwd });
  }

  let results: (TEslint.LintResult | TEslintLegacy.LintResult)[];
  try {
    results = await eslint.lintFiles(files);
  } catch (e) {
    throw new Error(`@rushstack/eslint-bulk execution error: ${e.message}`);
  }

  const { write, prune } = await import('../bulk-suppressions-patch.ts');
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

  if (results.length > 0) {
    const stylishFormatter: TEslint.Formatter | TEslintLegacy.Formatter = await eslint.loadFormatter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedResults: string = await Promise.resolve(stylishFormatter.format(results as any));
    console.log(formattedResults);
  }

  console.log(
    '@rushstack/eslint-bulk: Successfully pruned unused suppressions in all .eslint-bulk-suppressions.json ' +
      `files under directory ${cwd}`
  );
}
