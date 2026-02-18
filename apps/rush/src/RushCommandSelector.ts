// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { ILaunchOptions } from '@microsoft/rush-lib/lib/index';
import { Colorize } from '@rushstack/terminal';

type CommandName = 'rush' | 'rush-pnpm' | 'rushx' | undefined;

/**
 * Both "rush" and "rushx" share the same src/start.ts entry point.  This makes it
 * a little easier for them to share all the same startup checks and version selector
 * logic.  RushCommandSelector looks at argv to determine whether we're doing "rush"
 * or "rushx" behavior, and then invokes the appropriate entry point in the selected
 * @microsoft/rush-lib.
 */
export class RushCommandSelector {
  public static failIfNotInvokedAsRush(version: string): void {
    const commandName: CommandName = RushCommandSelector._getCommandName();
    if (commandName !== 'rush' && commandName !== undefined) {
      RushCommandSelector._failWithError(
        `This repository is using Rush version ${version} which does not support the ${commandName} command`
      );
    }
  }

  public static execute(
    launcherVersion: string,
    selectedRushLib: typeof import('@microsoft/rush-lib'),
    options: ILaunchOptions
  ): void {
    const { Rush } = selectedRushLib;

    if (!Rush) {
      // This should be impossible unless we somehow loaded an unexpected version
      RushCommandSelector._failWithError(`Unable to find the "Rush" entry point in @microsoft/rush-lib`);
    }

    const commandName: CommandName = RushCommandSelector._getCommandName();

    if (commandName === 'rush-pnpm') {
      if (!Rush.launchRushPnpm) {
        RushCommandSelector._failWithError(
          `This repository is using Rush version ${Rush.version}` +
            ` which does not support the "rush-pnpm" command`
        );
      }
      Rush.launchRushPnpm(launcherVersion, {
        isManaged: options.isManaged,
        alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError
      });
    } else if (commandName === 'rushx') {
      if (!Rush.launchRushX) {
        RushCommandSelector._failWithError(
          `This repository is using Rush version ${Rush.version}` +
            ` which does not support the "rushx" command`
        );
      }
      Rush.launchRushX(launcherVersion, options);
    } else {
      Rush.launch(launcherVersion, options);
    }
  }

  private static _failWithError(message: string): never {
    console.log(Colorize.red(message));
    return process.exit(1);
  }

  private static _getCommandName(): CommandName {
    if (process.argv.length >= 2) {
      // Example:
      // argv[0]: "C:\\Program Files\\nodejs\\node.exe"
      // argv[1]: "C:\\Program Files\\nodejs\\node_modules\\@microsoft\\rush\\bin\\rushx"
      const basename: string = path.basename(process.argv[1]).toUpperCase();
      if (basename === 'RUSH') {
        return 'rush';
      }
      if (basename === 'RUSH-PNPM') {
        return 'rush-pnpm';
      }
      if (basename === 'RUSHX') {
        return 'rushx';
      }
    }
    return undefined;
  }
}
