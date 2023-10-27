#!/usr/bin/env node
import type { ExecException } from 'child_process';
import { exec } from 'child_process';
import { Command } from 'commander';
import { whichEslint } from './utils/which-eslint';

export function makeCleanupCommand(): Command {
  const cleanup = new Command('cleanup');
  cleanup
    .description(
      'Delete unused suppression entries for the given file in the corresponding .eslint-bulk-suppressions.json file.'
    )
    .argument(
      '<files...>',
      'The "files" glob pattern argument follows the same rules as the "eslint" command.'
    )
    .action((files: string[]) => {
      const eslintCLI = whichEslint();

      const env = Object.assign({}, process.env);
      Object.assign(env, { CLEANUP_ESLINT_BULK_SUPPRESSIONS: 'true' });

      exec(
        `${eslintCLI} ${files.join(' ')}`,
        { env },
        (error: ExecException | null, stdout: string, stderr: string) => {
          // if errorCount != 0, ESLint will process.exit(1) giving the false impression
          // that the exec failed, even though linting errors are to be expected
          const eslintOutputWithErrorRegex = /"errorCount":(?!0)\d+/;
          const isEslintError = error !== null && error.code === 1 && eslintOutputWithErrorRegex.test(stdout);

          if (error && !isEslintError) {
            console.error(`Execution error: ${error.message}`);
            process.exit(1);
          }

          if (stderr) {
            console.error(`ESLint errors: ${stderr}`);
            process.exit(1);
          }

          console.log('Successfully cleaned up bulk suppressions');
        }
      );
    });

  return cleanup;
}
