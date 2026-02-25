// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import { BaseRushAction } from './BaseRushAction.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { Stopwatch } from '../../utilities/Stopwatch.ts';
import { PurgeManager } from '../../logic/PurgeManager.ts';
import { UnlinkManager } from '../../logic/UnlinkManager.ts';
import { PURGE_ACTION_NAME } from '../../utilities/actionNameConstants.ts';

export class PurgeAction extends BaseRushAction {
  private readonly _unsafeParameter: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: PURGE_ACTION_NAME,
      summary:
        'For diagnostic purposes, use this command to delete caches and other temporary files used by Rush',
      documentation:
        'The "rush purge" command is used to delete temporary files created by Rush.  This is' +
        ' useful if you are having problems and suspect that cache files may be corrupt.',
      parser
    });

    this._unsafeParameter = this.defineFlagParameter({
      parameterLongName: '--unsafe',
      description:
        '(UNSAFE!) Also delete shared files such as the package manager instances stored in' +
        ' the ".rush" folder in the user\'s home directory.  This is a more aggressive fix that is' +
        ' NOT SAFE to run in a live environment because it will cause other concurrent Rush processes to fail.'
    });
  }

  protected async runAsync(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    const unlinkManager: UnlinkManager = new UnlinkManager(this.rushConfiguration);
    const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration, this.rushGlobalFolder);

    await unlinkManager.unlinkAsync(/*force:*/ true);

    if (this._unsafeParameter.value!) {
      purgeManager.purgeUnsafe();
    } else {
      purgeManager.purgeNormal();
    }

    await purgeManager.startDeleteAllAsync();

    // eslint-disable-next-line no-console
    console.log(
      '\n' +
        Colorize.green(
          `Rush purge started successfully and will complete asynchronously. (${stopwatch.toString()})`
        )
    );
  }
}
