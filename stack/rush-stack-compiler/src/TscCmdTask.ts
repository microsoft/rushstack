// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  FileSystem,
  LegacyAdapters
} from '@microsoft/node-core-library';
import * as glob from 'glob';
import * as globEscape from 'glob-escape';
import * as typescript from 'typescript';
import * as decomment from 'decomment';

import {
  BaseCmdTask,
  IBaseCmdTaskConfig
} from './BaseCmdTask';
import { TsParseConfigHost } from './TsParseConfigHost';
import { Constants } from './Constants';

/**
 * @public
 */
export interface ITscCmdTaskConfig extends IBaseCmdTaskConfig {
}

/**
 * @alpha
 */
export class TscCmdTask extends BaseCmdTask<ITscCmdTaskConfig> {
  constructor(constants: Constants) {
    super(
      constants,
      'typescript',
      path.join('bin', 'tsc')
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
          console.error(trimmedLine);
        } else {
          console.log(trimmedLine);
        }
      }
    }
  }
}
