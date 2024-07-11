// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { Autoinstaller } from '../../logic/Autoinstaller';
import { BaseAutoinstallerAction } from './BaseAutoinstallerAction';

export class UpdateAutoinstallerAction extends BaseAutoinstallerAction {
  public constructor(parser: RushCommandLineParser) {
    super(parser, {
      actionName: 'update-autoinstaller',
      summary: 'Updates autoinstaller package dependencies',
      documentation: 'Use this command to regenerate the shrinkwrap file for an autoinstaller folder.',
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

    // Do not run `autoinstaller.prepareAsync` here. It tries to install the autoinstaller with
    // --frozen-lockfile or equivalent, which will fail if the autoinstaller's dependencies
    // have been changed.

    await autoinstaller.updateAsync();

    this._terminal.writeLine('\nSuccess.');
  }
}
