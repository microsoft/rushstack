#!/usr/bin/env node
import { ExecException, exec } from 'child_process';
import { whichEslint } from './utils/which-eslint';
import { wrapWordsToLines } from './utils/wrap-words-to-lines';

function printCleanHelp() {
  const help = `Usage: eslint-bulk suppress [options] <files...>

This command is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to delete all unused suppression entries in the local .eslint-bulk-suppressions.json file that correspond to the target files given as arguments.

Argument:
  <files...>
    Glob patterns for files to suppress, same as eslint files argument. Should be relative to the project root.

Options:
  --unsafe-eslint-version
    Use if you don't have a supported version of ESLint installed in your local package. This option will search around the file system for other local or global ESLint installations, or use npx to run ESLint from remote.
`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}

export function clean() {
  const args = process.argv.slice(3);

  if (args.includes('--help') || args.includes('-h')) {
    printCleanHelp();
    process.exit(0);
  }

  // Use reduce to create an object with all the parsed arguments
  const parsedArgs = args.reduce<{
    files: string[];
    unsafeEslintVersion: boolean;
  }>(
    (acc, arg, index, arr) => {
      if (arg === '--unsafe-eslint-version') {
        acc.unsafeEslintVersion = true;
      } else {
        acc.files.push(arg);
      }
      return acc;
    },
    { unsafeEslintVersion: false, files: [] }
  );

  if (parsedArgs.files.length === 0) {
    throw new Error(
      '@rushstack/eslint-bulk: Files argument is required. Use glob patterns to specify files or use `.` to suppress all files for the specified rules.'
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
  env.ESLINT_BULK_CLEAN = 'true';

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
        `@rushstack/eslint-bulk: Successfully cleaned up .eslint-bulk-suppressions.json at ${process.cwd()} for ${
          parsedArgs.files
        }`
      );
    }
  );
}
