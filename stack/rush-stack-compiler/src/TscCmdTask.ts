// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  Terminal
} from '@microsoft/node-core-library';

import {
  BaseCmdTask,
  IBaseCmdTaskOptions
} from './BaseCmdTask';
import { Constants } from './Constants';

/**
 * @beta
 */
export class TscCmdTask extends BaseCmdTask<IBaseCmdTaskOptions> {
  constructor(taskOptions: IBaseCmdTaskOptions, constants: Constants, terminal: Terminal) {
    super(
      constants,
      terminal,
      {
        packageName: 'typeScript',
        packageBinPath: path.join('bin', 'tsc'),
        taskOptions
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'tsc-cmd.schema.json'));
  }

  public invoke(): Promise<void> {
    return super.invokeCmd();
  }

  protected _onData(data: Buffer): void {
    // Log lines separately
    const dataLines: (string | undefined)[] = data.toString().split('\n');
    for (const dataLine of dataLines) {
      const trimmedLine: string = (dataLine || '').trim();
      if (!!trimmedLine) {
        if (trimmedLine.match(/\serror\s/i)) {
          // If the line looks like an error, log it as an error
          this._terminal.writeErrorLine(trimmedLine);
        } else {
          this._terminal.writeLine(trimmedLine);
        }
      }
    }
  }
}
