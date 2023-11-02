#!/usr/bin/env node
import { clean } from './clean';
import { suppress } from './suppress';
import { isCorrectCwd } from './utils/is-correct-cwd';

if (!isCorrectCwd(process.cwd())) {
  throw new Error(
    '@rushstack/eslint-bulk: Please call this command from the directory that contains .eslintrc.js or .eslintrc.cjs'
  );
}
const subcommand = process.argv[2];
if (subcommand === 'suppress') {
  suppress();
} else if (subcommand === 'clean') {
  clean();
} else {
  throw new Error('@rushstack/eslint-bulk: Unknown subcommand: ' + subcommand);
}
