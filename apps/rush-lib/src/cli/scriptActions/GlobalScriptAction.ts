// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import { Utilities } from '../../utilities/Utilities';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';

/**
 * Constructor parameters for GlobalScriptAction.
 */
export interface IGlobalScriptActionOptions extends IBaseScriptActionOptions {
  shellCommand: string;
}

/**
 * This class implements custom commands that are run once globally for the entire repo
 * (versus bulk commands, which run separately for each project).  The action executes
 * a user-defined script file.
 *
 * @remarks
 * Bulk commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as bulk commands, because they essentially just
 * invoke scripts from package.json in the same way as a custom command.
 */
export class GlobalScriptAction extends BaseScriptAction {
  private _shellCommand: string;

  public constructor(
    options: IGlobalScriptActionOptions
  ) {
    super(options);
    this._shellCommand = options.shellCommand;
  }

  public run(): Promise<void> {
    return Promise.resolve().then(() => {
      // Collect all custom parameter values
      const customParameterValues: string[] = [];

      for (const customParameter of this.customParameters) {
        customParameter.appendToArgList(customParameterValues);
      }

      let shellCommand: string = this._shellCommand;
      if (customParameterValues.length > 0) {
        shellCommand += ' ' + customParameterValues.join(' ');
      }

      const exitCode: number = Utilities.executeLifecycleCommand(
        shellCommand,
        {
          rushConfiguration: this.rushConfiguration,
          workingDirectory: this.rushConfiguration.rushJsonFolder,
          initCwd: this.rushConfiguration.commonTempFolder,
          handleOutput: false,
          environmentPathOptions: {
            includeRepoBin: true
          }
        }
      );

      process.exitCode = exitCode;

      if (exitCode > 0) {
        console.log(os.EOL + colors.red(`The script failed with exit code ${exitCode}`));
        throw new AlreadyReportedError();
      }
    });
  }

  protected onDefineParameters(): void {
    this.defineScriptParameters();
  }
}
