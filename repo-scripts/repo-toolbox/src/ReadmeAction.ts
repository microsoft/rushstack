// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import {
  CommandLineAction
} from '@microsoft/ts-command-line';

export class ReadmeAction extends CommandLineAction {
  public constructor() {
    super({
      actionName: 'readme',
      summary: 'Generates README.md project table based on rush.json inventory',
      documentation: 'Use this to update the repo\'s README.md'
    });
  }

  protected onExecute(): Promise<void> { // abstract
    console.log('hi');
    return Promise.resolve();
  }

  protected onDefineParameters(): void { // abstract
  }
}
