#!/usr/bin/env node
import type { ExecException } from 'child_process';
import { exec } from 'child_process';
import { whichEslint } from './utils/which-eslint';
import { isCorrectCwd } from './utils/is-correct-cwd';

export function suppress() {
  const args = process.argv.slice(3);
  if (!isCorrectCwd(process.cwd())) {
    console.error(
      '@rushstack/eslint-bulk: Please call this command from the directory that contains package.json'
    );
    process.exit(1);
  }

  // Use reduce to create an object with all the parsed arguments
  const parsedArgs = args.reduce<{ rules: string[]; all: boolean; unsafeEslint: boolean; files: string[] }>(
    (acc, arg, index, arr) => {
      if (arg === '--rule' && arr[index + 1]) {
        acc.rules.push(arr[index + 1]);
      } else if (arg === '--all') {
        acc.all = true;
      } else if (arg === '--unsafeEslint') {
        acc.unsafeEslint = true;
      } else if (!arg.startsWith('--')) {
        acc.files.push(arg);
      } else if (arg.startsWith('--') && !['--rule', '--all'].includes(arg)) {
        throw new Error(`@rushstack/eslint-bulk: Unknown option: ${arg}`);
      }
      return acc;
    },
    { rules: [], all: false, unsafeEslint: false, files: [] }
  );

  const eslintCLI = whichEslint(process.cwd(), parsedArgs.unsafeEslint);

  // Find the index of the last argument that starts with '--'
  const lastOptionIndex = args
    .map((arg, i) => (arg.startsWith('--') ? i : -1))
    .reduce((lastIndex, currentIndex) => Math.max(lastIndex, currentIndex), -1);

  console.log(lastOptionIndex);

  // Check if options come before files
  if (parsedArgs.files.some((file) => args.indexOf(file) < lastOptionIndex)) {
    console.error(
      '@rushstack/eslint-bulk: Unable to parse command line arguments. All options should come before files argument.'
    );
    process.exit(1);
  }

  const env = { ...process.env };
  if (parsedArgs.all) {
    env.ESLINT_BULK_SUPPRESS = '*';
  } else if (parsedArgs.rules.length > 0) {
    env.ESLINT_BULK_SUPPRESS = parsedArgs.rules.join(',');
  }

  exec(
    `${eslintCLI} ${parsedArgs.files.join(' ')} --format=json`,
    { env },
    (error: ExecException | null, stdout: string, stderr: string) => {
      // if errorCount != 0, ESLint will process.exit(1) giving the false impression
      // that the exec failed, even though linting errors are to be expected
      const eslintOutputWithErrorRegex = /"errorCount":(?!0)\d+/;
      const isEslintError = error !== null && error.code === 1 && eslintOutputWithErrorRegex.test(stdout);

      if (error && !isEslintError) {
        console.error(`@rushstack/eslint-bulk execution error: ${error.message}`);
        process.exit(1);
      }

      if (stderr) {
        console.error(`@rushstack/eslint-bulk ESLint errors: ${stderr}`);
        process.exit(1);
      }

      if (parsedArgs.all) {
        console.log(
          `@rushstack/eslint-bulk: Successfully suppressed all rules for file(s) ${parsedArgs.files.join(
            ','
          )}`
        );
      } else if (parsedArgs.rules.length > 0) {
        console.log(
          `@rushstack/eslint-bulk: Successfully suppressed rules ${parsedArgs.rules.join(
            ','
          )} for file(s) ${parsedArgs.files.join(',')}`
        );
      }
    }
  );
}
