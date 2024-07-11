// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';

export class InstallAutoinstallerAction extends BaseRushAction {
  private readonly _name: IRequiredCommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'install-autoinstaller',
      summary: 'Install autoinstaller package dependencies',
      documentation: 'Use this command to install dependencies for an autoinstaller folder.',
      parser
    });

    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'The name of the autoinstaller, which must be one of the folders under common/autoinstallers.'
    });
  }

  protected async runAsync(): Promise<void> {
    const autoinstallerName: string = this._name.value;
    const autoinstaller: Autoinstaller = new Autoinstaller({
      autoinstallerName,
      rushConfiguration: this.rushConfiguration,
      rushGlobalFolder: this.rushGlobalFolder
    });

    await autoinstaller.prepareAsync();

    // eslint-disable-next-line no-console
    console.log('\nSuccess.');
  }
}
