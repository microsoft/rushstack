// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import yargs from 'yargs';
import { Colorize } from '@rushstack/terminal';

import { checkCommand } from './commands/check';
import { startAppCommand } from './commands/startApp';

yargs
  .scriptName('lockfile-explorer')
  .command(checkCommand)
  .command(startAppCommand)
  // --debug
  .boolean('debug')
  .alias('help', 'h')
  .parseAsync()
  .catch((error) => {
    console.log(Colorize.red('ERROR: ' + error.message));
    process.exit(1);
  });
