// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';

import { printPruneHelp } from './utils/print-help';
import { runEslintAsync } from './runEslint';
import { ESLINT_BULK_PRUNE_ENV_VAR_NAME } from '../constants';
import { getSuppressionsConfigForEslintrcFolderPath } from '../bulk-suppressions-file';

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

  const allFiles: string[] = await getAllFilesWithExistingSuppressionsForCwdAsync();
  await runEslintAsync(allFiles, 'prune');
}

async function getAllFilesWithExistingSuppressionsForCwdAsync(): Promise<string[]> {
  const { jsonObject: bulkSuppressionsConfigJson } = getSuppressionsConfigForEslintrcFolderPath(
    process.cwd().replace(/\\/g, '/')
  );
  const allFiles: Set<string> = new Set();
  for (const { file: filePath } of bulkSuppressionsConfigJson.suppressions) {
    allFiles.add(filePath);
  }

  const allFilesArray: string[] = Array.from(allFiles);

  const allExistingFiles: string[] = [];
  // TODO: limit parallelism here with something similar to `Async.forEachAsync` from `node-core-library`.
  await Promise.all(
    allFilesArray.map(async (filePath: string) => {
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        allExistingFiles.push(filePath);
      } catch {
        // Doesn't exist - ignore
      }
    })
  );

  console.log(`Found ${allExistingFiles.length} files with existing suppressions.`);
  const deletedCount: number = allFilesArray.length - allExistingFiles.length;
  if (deletedCount > 0) {
    console.log(`${deletedCount} files with suppressions were deleted.`);
  }

  console.log(`Pruning suppressions for ${allExistingFiles.length} files...`);

  return allExistingFiles;
}
