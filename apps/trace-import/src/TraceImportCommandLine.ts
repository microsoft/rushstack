// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors';

import { CommandLineParser, CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { InternalError } from '@rushstack/node-core-library';

export class TraceImportCommandLine extends CommandLineParser {
  private readonly _debugParameter: CommandLineFlagParameter;

  public constructor() {
    super({
      toolFilename: 'trace-import',
      toolDescription: ''
    });

    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });
  }

  protected async onExecute(): Promise<void> {
    // override
    if (this._debugParameter.value) {
      InternalError.breakInDebugger = true;
    }
    try {
      this._execute();
    } catch (error) {
      if (this._debugParameter.value) {
        console.error('\n' + error.stack);
      } else {
        console.error('\n' + colors.red('ERROR: ' + error.message.trim()));
      }
    }
  }

  private _execute(): void {
    console.log('Hello, world!');
  }
}
