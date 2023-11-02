#!/usr/bin/env node
import { ExecException, exec } from 'child_process';
import { whichEslint } from './utils/which-eslint';
import { wrapWordsToLines } from './utils/wrap-words-to-lines';

function printSuppressHelp() {
  const help = `Usage: eslint-bulk suppress [options] <files...>

This command is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to either generate a new .eslint-bulk-suppressions.json file or add suppression entries to the existing file. Specify the files and rules you want to suppress.

Argument:
  <files...>
    Glob patterns for files to suppress, same as eslint files argument. Should be relative to the project root.

Options:
  -h, -H, --help
    Display this help message.

  -R, --rule
    The full name of the ESLint rule you want to bulk-suppress. Specify multiple rules with --rule rule1 --rule rule2.

  -A, --all
    Bulk-suppress all rules in the specified file patterns.
    
  --unsafe-eslint-version
    Use if you don't have a supported version of ESLint installed in your local package. This option will search around the file system for other local or global ESLint installations, or use npx to run ESLint from remote.
  `;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}

export function suppress() {
  const args = process.argv.slice(3);

  if (args.includes('--help') || args.includes('-h')) {
    printSuppressHelp();
    process.exit(0);
  }

  // Use reduce to create an object with all the parsed arguments
  const parsedArgs = args.reduce<{
    rules: string[];
    all: boolean;
    unsafeEslintVersion: boolean;
    files: string[];
  }>(
    (acc, arg, index, arr) => {
      if (arg === '--rule' && arr[index + 1]) {
        acc.rules.push(arr[index + 1]);
      } else if (arg === '--all') {
        acc.all = true;
      } else if (arg === '--unsafe-eslint-version') {
        acc.unsafeEslintVersion = true;
      } else if (arg.startsWith('--')) {
        throw new Error(`@rushstack/eslint-bulk: Unknown option: ${arg}`);
      } else {
        acc.files.push(arg);
      }
      return acc;
    },
    { rules: [], all: false, unsafeEslintVersion: false, files: [] }
  );

  if (parsedArgs.files.length === 0) {
    throw new Error(
      '@rushstack/eslint-bulk: Files argument is required. Use glob patterns to specify files or use `.` to suppress all files for the specified rules.'
    );
  }

  if (parsedArgs.rules.length === 0 && !parsedArgs.all) {
    throw new Error(
      '@rushstack/eslint-bulk: Please specify at least one rule to suppress. Use --all to suppress all rules.'
    );
  }

  const eslintCLI = whichEslint(process.cwd(), parsedArgs.unsafeEslintVersion);

  // Find the index of the last argument that starts with '--'
  const lastOptionIndex = args
    .map((arg, i) => (arg.startsWith('--') ? i : -1))
    .reduce((lastIndex, currentIndex) => Math.max(lastIndex, currentIndex), -1);

  // Check if options come before files
  if (parsedArgs.files.some((file) => args.indexOf(file) < lastOptionIndex)) {
    throw new Error(
      '@rushstack/eslint-bulk: Unable to parse command line arguments. All options should come before files argument.'
    );
  }

  const env = Object.assign({}, process.env);
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
        throw new Error(`@rushstack/eslint-bulk execution error: ${error.message}`);
      }

      if (stderr) {
        throw new Error(`@rushstack/eslint-bulk ESLint errors: ${stderr}`);
      }

      if (parsedArgs.all) {
        console.log(
          `@rushstack/eslint-bulk: Successfully suppressed all rules for file(s) ${parsedArgs.files}`
        );
      } else if (parsedArgs.rules.length > 0) {
        console.log(
          `@rushstack/eslint-bulk: Successfully suppressed rules ${parsedArgs.rules} for file(s) ${parsedArgs.files}`
        );
      }
    }
  );
}
