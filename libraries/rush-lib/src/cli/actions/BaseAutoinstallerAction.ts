// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';
import { Autoinstaller } from '../../logic/Autoinstaller';

export abstract class BaseAutoinstallerAction extends BaseRushAction {
  protected readonly _name: IRequiredCommandLineStringParameter;
  protected readonly _terminal: ITerminal;

  public constructor(options: IBaseRushActionOptions) {
    super(options);

    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'The name of the autoinstaller, which must be one of the folders under common/autoinstallers.'
    });

    this._terminal = this.parser.terminal;
  }

  protected abstract prepareAsync(autoinstaller: Autoinstaller): Promise<void>;

  protected async runAsync(): Promise<void> {
    const autoinstallerName: string = this._name.value;
    const autoinstaller: Autoinstaller = new Autoinstaller({
      autoinstallerName,
      rushConfiguration: this.rushConfiguration,
      rushGlobalFolder: this.rushGlobalFolder
    });

    await this.prepareAsync(autoinstaller);

    this._terminal.writeLine();
    this._terminal.writeLine('Success.');
  }
}
