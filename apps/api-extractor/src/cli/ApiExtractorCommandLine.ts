// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { CommandLineParser, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import { InternalError } from '@microsoft/node-core-library';

import { RunAction } from './RunAction';

export class ApiExtractorCommandLine extends CommandLineParser {
  private _debugParameter: CommandLineFlagParameter;

  constructor() {
    super({
      toolFilename: 'api-extractor',
      toolDescription: 'This is an experimental command line interface for the API Extractor tool.'
    });
    this._populateActions();
  }

  protected onDefineParameters(): void { // override
    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });
  }

  protected onExecute(): Promise<void> { // override
    if (this._debugParameter.value) {
      InternalError.breakInDebugger = true;
    }

    return super.onExecute().catch((error) => {

      if (this._debugParameter.value) {
        console.error(os.EOL + error.stack);
      } else {
        console.error(os.EOL + colors.red('ERROR: ' + error.message.trim()));
      }

      process.exitCode = 1;
    });
  }

  private _populateActions(): void {
    this.addAction(new RunAction(this));
  }
}
