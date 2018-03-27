// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineStringListParameter } from '@microsoft/ts-command-line';

import { BaseRushAction } from './BaseRushAction';

export abstract class BaseInstallAction extends BaseRushAction {
  protected _authenticationTokensParameter: CommandLineStringListParameter;

  protected onDefineParameters(): void {
    this._authenticationTokensParameter = this.defineStringListParameter({
      parameterLongName: '--auth-token',
      description: '(EXPERIMENTAL) List authentication tokens required to install packages. These must be in the '
        + 'format of lines of a .npmrc file. They will be appended to the .npmrc file used during package installation.'
    });
  }
}
