// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineStringParameter,
  CommandLineAction
} from '@microsoft/ts-command-line';

import { Terminal } from '@microsoft/node-core-library';

export class GenerateAction extends CommandLineAction {
  private _terminal: Terminal;

  private _exampleOption: CommandLineStringParameter;

  constructor(terminal: Terminal) {
    super({
      actionName: 'generate',
      summary: 'Generates a BuildXL configuration for the current Rush repository.',
      documentation: 'Generates a BuildXL configuration for the current Rush repository.'
    });

    this._terminal = terminal;
  }

  public onDefineParameters(): void {
    this._exampleOption = this.defineStringParameter({
      parameterLongName: '--example-parameter',
      argumentName: 'STRING',
      description: 'Am example paramter'
    });
  }

  protected async onExecute(): Promise<void> {
    this._terminal.writeLine('Example terminal output');

    this._terminal.writeLine(`The value of ${this._exampleOption.longName} is "${this._exampleOption.value}".`);
  }
}
