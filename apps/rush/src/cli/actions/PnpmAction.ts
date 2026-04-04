// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RUSH_PNPM_SCRIPT_NAME } from '../../logic/pnpm/PnpmProjectDependencyManifest';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { PnpmInstallManager } from '../../logic/pnpm/PnpmInstallManager';
import { RushConfiguration } from '../../api/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';

export class PnpmAction extends BaseRushAction {
  public constructor(
    protected rushConfiguration: RushConfiguration | undefined,
    parser?: RushCommandLineParser
  ) {
    super({
      actionName: RUSH_PNPM_SCRIPT_NAME,
      summary:
        'When rush is configured to use pnpm, this command is a wrapper for "pnpm".' +
        ' It will always use the version of pnpm that is specified in your rush.json file.' +
        ' Any command-line parameters will be passed through to the underlying "pnpm" executable.',
      documentation:
        'When rush is configured to use pnpm, this command is a wrapper for "pnpm".' +
        ' It will always use the version of pnpm that is specified in your rush.json file.' +
        ' Any command-line parameters will be passed through to the underlying "pnpm" executable.' +
        ' If you want to use a global pnpm installation instead, you can add a "pnpm" entry to the' +
        ' "preferredVersions" setting in your command-path.json file.',
      safeForSimultaneousRushProcesses: true,
      parser: parser,
      default: true
    });
  }

  public onDefineParameters(): void {
    // No parameters are defined because this action passes all parameters to the pnpm executable
  }

  public async run(): Promise<void> {
    if (!this.rushConfiguration) {
      // This should be impossible, but might as well check
      throw new Error('The "rush-pnpm" command must be run inside a Rush repository.');
    }

    const pnpmInstallManager: PnpmInstallManager = this.rushConfiguration.packageManagerTool as PnpmInstallManager;

    const pnpmArgs: string[] = this.parser.remainder.raw.slice();

    Utilities.executeCommand({
      command: pnpmInstallManager.pnpmPath,
      args: pnpmArgs,
      workingDirectory: this.rushConfiguration.commonTempFolder,
      allowConsoleOutput: true
    });
  }
}
