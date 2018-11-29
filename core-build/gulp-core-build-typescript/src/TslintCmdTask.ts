// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';
import { TslintRunner as TTslintRunner } from '@microsoft/rush-stack-compiler-2.7';

import {
  RSCTask,
  IRSCTaskConfig
} from './RSCTask';

/**
 * @public
 */
export interface ITslintCmdTaskConfig extends IRSCTaskConfig {
  /**
   * If true, displays warnings as errors. Defaults to false.
   */
  displayAsError?: boolean;
}

/**
 * @beta
 */
export class TslintCmdTask extends RSCTask<ITslintCmdTaskConfig> {
  constructor() {
    super(
      'tslint',
      {
        displayAsError: false
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'tslint-cmd.schema.json'));
  }

  public executeTask(): Promise<void> {
    this.initializeRushStackCompiler();

    const tslintRunner: TTslintRunner = new this._rushStackCompiler.TslintRunner(
      {
        displayAsError: this.taskConfig.displayAsError,

        fileError: this.fileError.bind(this),
        fileWarning: this.fileWarning.bind(this)
      },
      this.buildFolder,
      this._terminalProvider
    );

    return tslintRunner.invoke();
  }
}
