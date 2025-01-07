// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { CreateLinksAction } from './actions/CreateLinksAction';
import { RemoveLinksAction } from './actions/RemoveLinksAction';

export class CreateLinksCommandLineParser extends CommandLineParser {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      toolFilename: 'create-links',
      toolDescription: 'Create or remove symlinks for the extracted packages'
    });

    this._terminal = terminal;

    this.addAction(new CreateLinksAction(this._terminal));
    this.addAction(new RemoveLinksAction(this._terminal));
  }

  protected async onExecute(): Promise<void> {
    // override
    process.exitCode = 1;

    try {
      await super.onExecute();
      process.exitCode = 0;
    } catch (error) {
      if (!(error instanceof AlreadyReportedError)) {
        this._terminal.writeErrorLine();
        this._terminal.writeErrorLine('ERROR: ' + error.message.trim());
      }
    }
  }
}
