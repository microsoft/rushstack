// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, PrintUtilities } from '@rushstack/terminal';

import { RushConstants } from '../logic/RushConstants.ts';

export class CommandLineMigrationAdvisor {
  // NOTE: THIS RUNS BEFORE THE REAL COMMAND-LINE PARSING.
  // TAKE EXTREME CARE THAT THE HEURISTICS CANNOT FALSELY MATCH A VALID COMMAND LINE.
  public static checkArgv(argv: string[]): boolean {
    // 0=node.exe, 1=script name
    const args: string[] = process.argv.slice(2);

    if (args.length > 0) {
      if (args[0] === 'generate') {
        CommandLineMigrationAdvisor._reportDeprecated(
          'Instead of "rush generate", use "rush update" or "rush update --full".'
        );
        return false;
      }

      if (args[0] === 'install') {
        if (args.indexOf('--full-clean') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            'Instead of "rush install --full-clean", use "rush purge --unsafe".'
          );
          return false;
        }
        if (args.indexOf('-C') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            'Instead of "rush install -C", use "rush purge --unsafe".'
          );
          return false;
        }
        if (args.indexOf('--clean') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            'Instead of "rush install --clean", use "rush install --purge".'
          );
          return false;
        }
        if (args.indexOf('-c') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            'Instead of "rush install -c", use "rush install --purge".'
          );
          return false;
        }
      }
    }

    // Everything is okay
    return true;
  }

  private static _reportDeprecated(message: string): void {
    // eslint-disable-next-line no-console
    console.error(
      Colorize.red(
        PrintUtilities.wrapWords(
          'ERROR: You specified an outdated command-line that is no longer supported by this version of Rush:'
        )
      )
    );
    // eslint-disable-next-line no-console
    console.error(Colorize.yellow(PrintUtilities.wrapWords(message)));
    // eslint-disable-next-line no-console
    console.error();
    // eslint-disable-next-line no-console
    console.error(
      PrintUtilities.wrapWords(
        `For command-line help, type "rush -h".  For migration instructions,` +
          ` please visit ${RushConstants.rushWebSiteUrl}`
      )
    );
  }
}
