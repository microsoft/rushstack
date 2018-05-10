// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { BaseInstallAction } from './BaseInstallAction';
import { IInstallManagerOptions } from '../logic/InstallManager';
import { RushCommandLineParser } from './RushCommandLineParser';

export class UpdateAction extends BaseInstallAction {
  private _fullParameter: CommandLineFlagParameter;
  private _recheckParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update',
      summary: '',
      documentation: '',
      parser
    });
  }

  protected onDefineParameters(): void {
    super.onDefineParameters();

    this._fullParameter = this.defineFlagParameter({
      parameterLongName: '--full',
      description: ''
    });
    this._recheckParameter = this.defineFlagParameter({
      parameterLongName: '--recheck',
      description: ''
    });
  }

  protected buildInstallOptions(): IInstallManagerOptions {
    return {
      allowShrinkwrapUpdates: true,
      bypassPolicy: this._bypassPolicyParameter.value!,
      noLink: this._noLinkParameter.value!,
      fullUpgrade: this._fullParameter.value!,
      recheckShrinkwrap: this._recheckParameter.value!
    };
  }
}
