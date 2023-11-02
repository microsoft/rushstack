import { wrapWordsToLines } from './wrap-words-to-lines';

export function printCleanHelp() {
  const help = `Usage: eslint-bulk suppress [options] <files...>

This command is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to delete all unused suppression entries in the local .eslint-bulk-suppressions.json file that correspond to the target files given as arguments.

Argument:
  <files...>
    Glob patterns for files to suppress, same as eslint files argument. Should be relative to the project root.`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}

export function printHelp() {
  const help = `Usage: eslint-bulk <command> [options] <files...>

This command is a thin wrapper around ESLint that communicates with @rushstack/eslint-patch to suppress or clean up unused suppressions in the local .eslint-bulk-suppressions.json file.

Commands:
  suppress
    Please run "eslint-bulk suppress --help" to learn how to use this command.

  clean
    Please run "eslint-bulk clean --help" to learn how to use this command.
`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}

export function printSuppressHelp() {
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
    Bulk-suppress all rules in the specified file patterns.`;

  const wrapped = wrapWordsToLines(help);
  for (const line of wrapped) {
    console.log(line);
  }
}
