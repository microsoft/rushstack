// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { printPruneHelp } from './utils/print-help';
import { runEslintAsync } from './runEslint';
import { ESLINT_BULK_PRUNE_ENV_VAR_NAME } from '../constants';

export async function pruneAsync(): Promise<void> {
  const args: string[] = process.argv.slice(3);

  if (args.includes('--help') || args.includes('-h')) {
    printPruneHelp();
    process.exit(0);
  }

  if (args.length > 0) {
    throw new Error(`@rushstack/eslint-bulk: Unknown arguments: ${args.join(' ')}`);
  }

  process.env[ESLINT_BULK_PRUNE_ENV_VAR_NAME] = '1';

  await runEslintAsync(['.'], 'prune');
}
