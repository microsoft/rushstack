// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';

import { RushConfiguration } from '../api/RushConfiguration';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';

export interface ILaunchRushPnpmInternalOptions {
  isManaged: boolean;
  alreadyReportedNodeTooNewError?: boolean;
}

export class RushPnpmCommandLine {
  public static launch(launcherVersion: string, options: ILaunchRushPnpmInternalOptions): void {
    // Node.js can sometimes accidentally terminate with a zero exit code  (e.g. for an uncaught
    // promise exception), so we start with the assumption that the exit code is 1
    // and set it to 0 only on success.
    process.exitCode = 1;

    try {
      // Are we in a Rush repo?
      let rushConfiguration: RushConfiguration | undefined = undefined;
      if (RushConfiguration.tryFindRushJsonLocation()) {
        rushConfiguration = RushConfiguration.loadFromDefaultLocation({ showVerbose: true });
      }

      NodeJsCompatibility.warnAboutCompatibilityIssues({
        isRushLib: true,
        alreadyReportedNodeTooNewError: !!options.alreadyReportedNodeTooNewError,
        rushConfiguration
      });

      console.log('Success');
      process.exitCode = 0;

    } catch (error) {
      console.log(colors.red('Error: ' + error.message));
    }
  }
}
