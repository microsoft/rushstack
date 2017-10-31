// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@microsoft/ts-command-line';
import { RunAction } from './RunAction';

export class ApiExtractorCommandLine extends CommandLineParser {
  constructor() {
    super({
      toolFilename: 'api-extractor',
      toolDescription: 'This is an experimental command line interface for the API Extractor tool.'
    });
    this._populateActions();
  }

  protected onDefineParameters(): void { // override
  }

  private _populateActions(): void {
    this.addAction(new RunAction(this));
  }
}
