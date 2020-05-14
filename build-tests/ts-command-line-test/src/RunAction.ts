// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction, CommandLineStringParameter } from '@rushstack/ts-command-line';


export class RunAction extends CommandLineAction {
  private _title: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'run',
      summary: 'Runs the rest of the command line as a shell command',
      documentation: 'Your long description goes here.'
    });
  }

  protected onExecute(): Promise<void> { // abstract
    console.log(`Title: ${this._title.value || '(none)'}`);
    console.log('Remainder: ' + JSON.stringify(this.remainder!.values));

    return Promise.resolve();
  }

  protected onDefineParameters(): void { // abstract
    this._title = this.defineStringParameter({
      parameterLongName: '--title',
      argumentName: 'TITLE',
      description: 'An optional title to show'
    });

    this.defineCommandLineRemainder({
      description: 'The remaining arguments will be blah.'
    });
  }
}
