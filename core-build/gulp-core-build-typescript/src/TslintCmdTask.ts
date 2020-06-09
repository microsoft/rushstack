// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonObject } from '@rushstack/node-core-library';
import { TslintRunner as TTslintRunner } from '@microsoft/rush-stack-compiler-3.1';

import { RSCTask, IRSCTaskConfig } from './RSCTask';

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
 * @public
 */
export class TslintCmdTask extends RSCTask<ITslintCmdTaskConfig> {
  public constructor() {
    super('tslint', {
      displayAsError: false
    });
  }

  public loadSchema(): JsonObject {
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
