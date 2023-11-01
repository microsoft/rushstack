#!/usr/bin/env node
import { isCorrectCwd } from './utils/is-correct-cwd';
import { suppress } from './suppress';

if (!isCorrectCwd) {
  console.error(
    '@rushstack/eslint-bulk: Please call this command from the directory that contains package.json'
  );
  process.exit(1);
}

const subcommand = process.argv[2];

if (subcommand === 'suppress') {
  suppress();
} else {
  console.error('@rushstack/eslint-bulk: Unknown subcommand: ' + subcommand);
  process.exit(1);
}
