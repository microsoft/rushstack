// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

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

  protected onExecute(): Promise<void> { // override
    return super.onExecute().catch((error) => {
      console.error(os.EOL + colors.red('ERROR: ' + error.message.trim()));
      process.exitCode = 1;
    });
  }

  private _populateActions(): void {
    this.addAction(new RunAction(this));
  }
}
