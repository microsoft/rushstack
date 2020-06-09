// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';
import { Terminal } from '@rushstack/node-core-library';

import { CleanAction } from './actions/CleanAction';
import { GenerateAction } from './actions/GenerateAction';

export class RushBuildXLCommandLineParser extends CommandLineParser {
  private _terminal: Terminal;

  public constructor(terminal: Terminal) {
    super({
      toolFilename: 'rush-buildlx',
      toolDescription: 'This experimental tool allows Rush to interact with BuildXL.'
    });

    this._terminal = terminal;

    this.addAction(new CleanAction(this._terminal));
    this.addAction(new GenerateAction(this._terminal));
  }

  protected onDefineParameters(): void {
    /* no global parameters */
  }

  protected onExecute(): Promise<void> {
    // override
    return super.onExecute().catch((error) => {
      this._terminal.writeErrorLine();
      this._terminal.writeErrorLine('ERROR: ' + error.message.trim());

      process.exitCode = 1;
    });
  }
}
