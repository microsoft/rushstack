// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { clean } from './clean';
import { suppress } from './suppress';
import { isCorrectCwd } from './utils/is-correct-cwd';
import { printHelp } from './utils/print-help';

if (process.argv.includes('-h') || process.argv.includes('-H') || process.argv.includes('--help')) {
  printHelp();
  process.exit(0);
}

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
