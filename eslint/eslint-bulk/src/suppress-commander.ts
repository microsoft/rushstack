#!/usr/bin/env node
import type { ExecException } from 'child_process';
import { exec } from 'child_process';
import { Command } from 'commander';
import { whichEslint } from './utils/which-eslint';

export function makeSuppressCommand(): Command {
  const suppress = new Command('suppress');
  suppress
    .description(
      'Generate a new .eslint-bulk-suppressions.json file or add suppression entries to an existing file.'
    )
    .argument(
      '<files...>',
      'The "files" glob pattern argument follows the same rules as the "eslint" command.'
    )
    .option('-R, --rule <rules...>', 'The full name of the ESlint rules you want to suppress.')
    .option('-A, --all', 'Suppress all rules instead of specific rule(s).')
    .action((files: string[], options: { all: boolean; rule: string[] }) => {
      if (!(options.all || options.rule)) {
        throw new Error('Please specify at least one rule to suppress');
      }

      const eslintCLI = whichEslint();

      const env = { ...process.env };
      if (options.all) {
        env.ESLINT_BULK_SUPPRESS = '*';
      } else if (options.rule) {
        env.ESLINT_BULK_SUPPRESS = options.rule.join(',');
      }

      exec(
        `${eslintCLI} ${files.join(' ')} --format=json`,
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

          if (options.all) {
            console.log(`Successfully suppressed all rules for file(s) ${files.join(',')}`);
          } else if (options.rule) {
            console.log(
              `Successfully suppressed rules ${options.rule.join(',')} for file(s) ${files.join(',')}`
            );
          }
        }
      );
    });
  return suppress;
}
