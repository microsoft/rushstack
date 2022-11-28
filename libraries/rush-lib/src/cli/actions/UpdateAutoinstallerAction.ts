// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineStringListParameter, CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';

export class UpdateAutoinstallerAction extends BaseRushAction {
  private readonly _names: CommandLineStringListParameter;
  private readonly _allFlag: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update-autoinstaller',
      summary: 'Updates autoinstaller package dependencies',
      documentation: 'Use this command to regenerate the lockfile for an autoinstaller folder.',
      parser
    });

    this._names = this.defineStringListParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      description:
        'Specifies the name of the autoinstaller, which must be one of the folders under common/autoinstallers. Provide this' +
        ' option more than once to update multiple autoinstallers. Required unless --all is specified.'
    });

    this._allFlag = this.defineFlagParameter({
      parameterLongName: '--all',
      description:
        'If this flag is provided, all existing autoinstallers in the autoinstallers folder will be detected and updated. Not compatible with --name parameter.'
    });
  }

  protected async runAsync(): Promise<void> {
    let autoinstallerNames: string[] | undefined = [];

    if (this._names.values.length > 0) {
      if (this._allFlag.value) {
        throw new Error(`${this._allFlag.longName} is not compatible with ${this._names.longName}`);
      }
      autoinstallerNames.push(...this._names.values);
    } else if (this._allFlag.value) {
      autoinstallerNames = undefined;
    } else {
      console.log(this.renderHelpText() + '\n');
      throw new Error(`Specify ${this._names.longName} parameter or the ${this._allFlag.longName} flag.`);
    }

    Autoinstaller.updateAutoinstallers(this.rushConfiguration, autoinstallerNames);

    console.log('\nSuccess.');
  }
}
