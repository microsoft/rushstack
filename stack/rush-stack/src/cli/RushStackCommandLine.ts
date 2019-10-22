// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@microsoft/ts-command-line';

import { BuildAction } from './BuildAction';
import { CleanAction } from './CleanAction';

export class RushStackCommandLine extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'rush-stack',
      toolDescription: ''
    });
    this._populateActions();
  }

  protected onDefineParameters(): void { // override
    // No parameters
  }

  private _populateActions(): void {
    this.addAction(new BuildAction(this));
    this.addAction(new CleanAction(this));
  }
}
