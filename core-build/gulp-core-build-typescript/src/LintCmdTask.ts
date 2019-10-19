// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';
import { LintRunner as TLintRunner } from '@microsoft/rush-stack-compiler-3.1';

import {
  RSCTask,
  IRSCTaskConfig
} from './RSCTask';

/**
 * @public
 */
export interface ILintCmdTaskConfig extends IRSCTaskConfig {
  /**
   * If true, displays warnings as errors. Defaults to false.
   */
  displayAsError?: boolean;
}

/**
 * @public
 */
export class LintCmdTask extends RSCTask<ILintCmdTaskConfig> {
  constructor() {
    super(
      'lint',
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

    const tslintRunner: TLintRunner = new this._rushStackCompiler.LintRunner(
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
