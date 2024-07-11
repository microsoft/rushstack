// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import { BaseRushAction } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';

export class InstallAutoinstallerAction extends BaseRushAction {
  private readonly _name: IRequiredCommandLineStringParameter;
  private readonly _terminal: ITerminal;

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

    this._terminal = parser.terminal;
  }

  protected async runAsync(): Promise<void> {
    const autoinstallerName: string = this._name.value;
    const autoinstaller: Autoinstaller = new Autoinstaller({
      autoinstallerName,
      rushConfiguration: this.rushConfiguration,
      rushGlobalFolder: this.rushGlobalFolder
    });

    await autoinstaller.prepareAsync();

    this._terminal.writeLine('\nSuccess.');
  }
}
