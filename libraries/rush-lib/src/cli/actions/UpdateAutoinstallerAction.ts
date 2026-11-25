// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { Autoinstaller } from '../../logic/Autoinstaller';
import { BaseAutoinstallerAction } from './BaseAutoinstallerAction';

export class UpdateAutoinstallerAction extends BaseAutoinstallerAction {
  readonly #preserveLockfile: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update-autoinstaller',
      summary: 'Updates autoinstaller package dependencies',
      documentation:
        'Use this command to regenerate the shrinkwrap file for an autoinstaller folder.' +
        ' By default, the existing lockfile is deleted to perform a full update.',
      parser
    });

    this.#preserveLockfile = this.defineFlagParameter({
      parameterLongName: '--preserve-lockfile',
      description:
        'Reconcile package.json using the existing lockfile instead of deleting it for a full update.' +
        ' Only supported for PNPM and requires an existing lockfile. Runs a non-frozen install;' +
        ' this is not a guarantee that all existing resolutions remain unchanged. Review the lockfile diff.'
    });
  }

  protected async prepareAsync(autoinstaller: Autoinstaller): Promise<void> {
    // Do not run `autoinstaller.prepareAsync` here. It tries to install the autoinstaller with
    // --frozen-lockfile or equivalent, which will fail if the autoinstaller's dependencies
    // have been changed.
    await autoinstaller.updateAsync({ preserveLockfile: this.#preserveLockfile.value });
  }
}
