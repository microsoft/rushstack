// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseInstallAction } from './BaseInstallAction';
import { IInstallManagerOptions } from '../logic/InstallManager';
import { RushCommandLineParser } from './RushCommandLineParser';

export class InstallAction extends BaseInstallAction {

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'install',
      summary: '',
      documentation: '',
      parser
    });
  }

  protected buildInstallOptions(): IInstallManagerOptions {
    return {
      allowShrinkwrapUpdates: false,
      bypassPolicy: this._bypassPolicyParameter.value!,
      noLink: this._noLinkParameter.value!,
      fullUpgrade: false,
      forceUpdateShrinkwrap: false
    };
  }
}
