// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type CommandLineFlagParameter,
  CommandLineAction,
  type IRequiredCommandLineChoiceParameter
} from '../../index.ts';

import { BusinessLogic } from './BusinessLogic.ts';

type Protocol = 'ftp' | 'webdav' | 'scp';

export class PushAction extends CommandLineAction {
  private readonly _force: CommandLineFlagParameter;
  private readonly _protocol: IRequiredCommandLineChoiceParameter<Protocol>;

  public constructor() {
    super({
      actionName: 'push',
      summary: 'Pushes a widget to the service',
      documentation: 'Here we provide a longer description of how our action works.'
    });

    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description: 'Push and overwrite any existing state'
    });

    this._protocol = this.defineChoiceParameter<Protocol>({
      parameterLongName: '--protocol',
      description: 'Specify the protocol to use',
      alternatives: ['ftp', 'webdav', 'scp'],
      environmentVariable: 'WIDGET_PROTOCOL',
      defaultValue: 'scp'
    });
  }

  protected onExecuteAsync(): Promise<void> {
    // abstract
    return BusinessLogic.doTheWorkAsync(this._force.value, this._protocol.value);
  }
}
