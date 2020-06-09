// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction, CommandLineStringParameter } from '@rushstack/ts-command-line';

export class RunAction extends CommandLineAction {
  private _title: CommandLineStringParameter;

  public constructor() {
    super({
      actionName: 'run',
      summary: 'This action (hypothetically) passes its command line arguments to the shell to be executed.',
      documentation: 'This demonstrates how to use the defineCommandLineRemainder() API.',
    });
  }

  protected onExecute(): Promise<void> {
    // abstract
    console.log(`Console Title: ${this._title.value || '(none)'}`);
    console.log('Arguments to be executed: ' + JSON.stringify(this.remainder!.values));

    return Promise.resolve();
  }

  protected onDefineParameters(): void {
    // abstract
    this._title = this.defineStringParameter({
      parameterLongName: '--title',
      argumentName: 'TITLE',
      environmentVariable: 'WIDGET_TITLE',
      description: 'An optional title to show in the console window',
    });

    this.defineCommandLineRemainder({
      description: 'The remaining arguments are passed along to the command shell.',
    });
  }
}
