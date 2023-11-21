// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ExecException, exec } from 'child_process';
import { getEslintCli } from './utils/get-eslint-cli';
import { printPruneHelp } from './utils/print-help';

export function prune() {
  const args = process.argv.slice(3);

  if (args.includes('--help') || args.includes('-h')) {
    printPruneHelp();
    process.exit(0);
  }

  const parsedArgs = args.reduce<{
    files: string[];
  }>(
    (acc, arg, index, arr) => {
      acc.files.push(arg);
      return acc;
    },
    { files: [] }
  );

  if (parsedArgs.files.length === 0) {
    throw new Error(
      '@rushstack/eslint-bulk: Files argument is required. Use glob patterns to specify files or use `.` to suppress all files for the specified rules.'
    );
  }

  const eslintCLI = getEslintCli(process.cwd());

  const env = Object.assign({}, process.env);
  env.ESLINT_BULK_PRUNE = 'true';

  exec(
    `${eslintCLI} ${parsedArgs.files.join(' ')} --format=json`,
    { env },
    (error: ExecException | null, stdout: string, stderr: string) => {
      // if errorCount != 0, ESLint will process.exit(1) giving the false impression
      // that the exec failed, even though linting errors are to be expected
      const eslintOutputWithErrorRegex = /"errorCount":(?!0)\d+/;
      const isEslintError = error !== null && error.code === 1 && eslintOutputWithErrorRegex.test(stdout);

      if (error && !isEslintError) {
        throw new Error(`@rushstack/eslint-bulk execution error: ${error.message}`);
      }

      if (stderr) {
        throw new Error(`@rushstack/eslint-bulk ESLint errors: ${stderr}`);
      }

      console.log(
        `@rushstack/eslint-bulk: Successfully pruned unused suppressions in .eslint-bulk-suppressions.json at ${process.cwd()} for ${
          parsedArgs.files
        }`
      );
    }
  );
}
