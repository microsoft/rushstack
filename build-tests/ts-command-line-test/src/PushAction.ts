// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter, CommandLineAction, CommandLineChoiceParameter } from '@rushstack/ts-command-line';
import { BusinessLogic } from './BusinessLogic';

export class PushAction extends CommandLineAction {
  private _force: CommandLineFlagParameter;
  private _protocol: CommandLineChoiceParameter;

  public constructor() {
    super({
      actionName: 'push',
      summary: 'Pushes a widget to the service',
      documentation: 'Your long description goes here.'
    });
  }

  protected onExecute(): Promise<void> { // abstract
    return BusinessLogic.doTheWork(this._force.value);
  }

  protected onDefineParameters(): void { // abstract
    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description: 'Push and overwrite any existing state'
    });

    this._protocol = this.defineChoiceParameter({
      parameterLongName: '--protocol',
      description: 'Specify the protocol to use',
      alternatives: ['ftp', 'webdav', 'scp'],
      environmentVariable: 'WIDGET_PROTOCOL',
      defaultValue: 'scp'
    });
  }
}
