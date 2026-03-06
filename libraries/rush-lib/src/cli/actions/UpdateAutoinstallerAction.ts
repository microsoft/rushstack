// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import type { Autoinstaller } from '../../logic/Autoinstaller.ts';
import { BaseAutoinstallerAction } from './BaseAutoinstallerAction.ts';

export class UpdateAutoinstallerAction extends BaseAutoinstallerAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update-autoinstaller',
      summary: 'Updates autoinstaller package dependencies',
      documentation: 'Use this command to regenerate the shrinkwrap file for an autoinstaller folder.',
      parser
    });
  }

  protected async prepareAsync(autoinstaller: Autoinstaller): Promise<void> {
    // Do not run `autoinstaller.prepareAsync` here. It tries to install the autoinstaller with
    // --frozen-lockfile or equivalent, which will fail if the autoinstaller's dependencies
    // have been changed.
    await autoinstaller.updateAsync();
  }
}
