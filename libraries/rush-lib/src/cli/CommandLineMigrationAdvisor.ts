// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import { PrintUtilities } from '@rushstack/terminal';

import { RushConstants } from '../logic/RushConstants';
import { getFilledCompositeString, strings } from '../loc';

export class CommandLineMigrationAdvisor {
  // NOTE: THIS RUNS BEFORE THE REAL COMMAND-LINE PARSING.
  // TAKE EXTREME CARE THAT THE HEURISTICS CANNOT FALSELY MATCH A VALID COMMAND LINE.
  public static checkArgv(argv: string[]): boolean {
    // 0=node.exe, 1=script name
    const args: string[] = process.argv.slice(2);

    if (args.length > 0) {
      if (args[0] === 'generate') {
        CommandLineMigrationAdvisor._reportDeprecated(
          getFilledCompositeString(
            strings.deprecatedCommandWarningTwoAlternatives,
            'rush generate',
            'rush update',
            'rush update --full'
          )
        );
        return false;
      }

      if (args[0] === 'install') {
        if (args.indexOf('--full-clean') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            getFilledCompositeString(
              strings.deprecatedCommandWarningSingleAlternative,
              'rush install --full-clean',
              'rush purge --unsafe'
            )
          );
          return false;
        }
        if (args.indexOf('-C') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            getFilledCompositeString(
              strings.deprecatedCommandWarningSingleAlternative,
              'rush install -C',
              'rush purge --unsafe'
            )
          );
          return false;
        }
        if (args.indexOf('--clean') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            getFilledCompositeString(
              strings.deprecatedCommandWarningSingleAlternative,
              'rush install --clean',
              'rush install --purge'
            )
          );
          return false;
        }
        if (args.indexOf('-c') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            getFilledCompositeString(
              strings.deprecatedCommandWarningSingleAlternative,
              'rush install -c',
              'rush install --purge'
            )
          );
          return false;
        }
      }
    }

    // Everything is okay
    return true;
  }

  private static _reportDeprecated(message: string): void {
    console.error(colors.red(PrintUtilities.wrapWords(strings.deprecatedCommandWarning)));
    console.error(colors.yellow(PrintUtilities.wrapWords(message)));
    console.error();
    console.error(
      PrintUtilities.wrapWords(
        getFilledCompositeString(strings.deprecatedCommandMigrationInstructions, RushConstants.rushWebSiteUrl)
      )
    );
  }
}
