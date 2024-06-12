// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import yargs from 'yargs';
import { Colorize } from '@rushstack/terminal';

import { lintCommand } from './commands/lint';

yargs
  .scriptName('lockfile-lint')
  .command(lintCommand)
  // --debug
  .boolean('debug')
  .alias('help', 'h')
  .parseAsync()
  .catch((error) => {
    console.log(Colorize.red('ERROR: ' + error.message));
    process.exit(1);
  });
