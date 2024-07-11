// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';
import { BaseAutoinstallerAction } from './BaseAutoinstallerAction';

export class InstallAutoinstallerAction extends BaseAutoinstallerAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'install-autoinstaller',
      summary: 'Install autoinstaller package dependencies',
      documentation: 'Use this command to install dependencies for an autoinstaller folder.',
      parser
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

    this._terminal.writeLine('\nSuccess.');
  }
}
