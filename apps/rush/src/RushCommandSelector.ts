// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import * as rushLib from '@microsoft/rush-lib';

type CommandName = 'rush' | 'rushx' | undefined;

/**
 * Both "rush" and "rushx" share the same src/start.ts entry point.  This makes it
 * a little easier for them to share all the same startup checks and version selector
 * logic.  RushCommandSelector looks at argv to determine whether we're doing "rush"
 * or "rushx" behavior, and then invokes the appropriate entry point in the selected
 * @microsoft/rush-lib.
 */
export class RushCommandSelector {
  public static failIfNotInvokedAsRush(version: string): void {
    if (RushCommandSelector._getCommandName() === 'rushx') {
      RushCommandSelector._failWithError(
        `This repository is using Rush version ${version}` + ` which does not support the "rushx" command`
      );
    }
  }

  // tslint:disable-next-line:no-any
  public static execute(launcherVersion: string, isManaged: boolean, selectedRushLib: any): void {
    const Rush: typeof rushLib.Rush = selectedRushLib.Rush;

    if (!Rush) {
      // This should be impossible unless we somehow loaded an unexpected version
      RushCommandSelector._failWithError(`Unable to find the "Rush" entry point in @microsoft/rush-lib`);
    }

    if (RushCommandSelector._getCommandName() === 'rushx') {
      if (!Rush.launchRushX) {
        RushCommandSelector._failWithError(
          `This repository is using Rush version ${Rush.version}` +
            ` which does not support the "rushx" command`
        );
      }
      Rush.launchRushX(launcherVersion, isManaged);
    } else {
      Rush.launch(launcherVersion, isManaged);
    }
  }

  private static _failWithError(message: string): never {
    console.log(colors.red(message));
    return process.exit(1);
  }

  private static _getCommandName(): CommandName {
    if (process.argv.length >= 2) {
      // Example:
      // argv[0]: "C:\\Program Files\\nodejs\\node.exe"
      // argv[1]: "C:\\Program Files\\nodejs\\node_modules\\@microsoft\\rush\\bin\\rushx"
      const basename: string = path.basename(process.argv[1]).toUpperCase();
      if (basename === 'RUSHX') {
        return 'rushx';
      }
      if (basename === 'RUSH') {
        return 'rush';
      }
    }
    return undefined;
  }
}
