// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Autoinstaller } from '../../logic/Autoinstaller.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { BaseAutoinstallerAction } from './BaseAutoinstallerAction.ts';

export class InstallAutoinstallerAction extends BaseAutoinstallerAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'install-autoinstaller',
      summary: 'Install autoinstaller package dependencies',
      documentation: 'Use this command to install dependencies for an autoinstaller folder.',
      parser
    });
  }

  protected async prepareAsync(autoinstaller: Autoinstaller): Promise<void> {
    await autoinstaller.prepareAsync();
  }
}
