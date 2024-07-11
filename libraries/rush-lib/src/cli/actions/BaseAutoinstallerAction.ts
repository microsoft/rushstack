// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';

export abstract class BaseAutoinstallerAction extends BaseRushAction {
  protected readonly _name: IRequiredCommandLineStringParameter;
  protected readonly _terminal: ITerminal;

  public constructor(parser: RushCommandLineParser, options: IBaseRushActionOptions) {
    super(options);

    this._name = this.defineStringParameter({
      parameterLongName: '--name',
      argumentName: 'AUTOINSTALLER_NAME',
      required: true,
      description:
        'Specifies the name of the autoinstaller, which must be one of the folders under common/autoinstallers.'
    });

    this._terminal = parser.terminal;
  }

  protected abstract runAsync(): Promise<void>;
}
