// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { CommandLineAction } from '@rushstack/ts-command-line';
import { Terminal, FileSystem } from '@rushstack/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';

export class CleanAction extends CommandLineAction {
  private _terminal: Terminal;

  public constructor(terminal: Terminal) {
    super({
      actionName: 'clean',
      summary: 'Cleans up generated BuildXL configuration for the current Rush repository.',
      documentation: 'Cleans up generated BuildXL configuration for the current Rush repository.',
    });

    this._terminal = terminal;
  }

  public onDefineParameters(): void {
    /* This action doesn't take any parameters*/
  }

  protected async onExecute(): Promise<void> {
    const rushConfig: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

    FileSystem.deleteFolder(path.resolve(rushConfig.commonTempFolder, 'bxl', 'modules'));

    this._terminal.writeLine(`Successfully cleaned BuildXL configuration.`);
  }
}
