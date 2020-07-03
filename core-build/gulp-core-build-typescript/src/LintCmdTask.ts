// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonObject } from '@rushstack/node-core-library';
import * as TRushStackCompiler from '@microsoft/rush-stack-compiler-3.1';

import { RSCTask, IRSCTaskConfig } from './RSCTask';

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
  public constructor() {
    super('lint', {
      displayAsError: false
    });
  }

  public loadSchema(): JsonObject {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'lint-cmd.schema.json'));
  }

  public executeTask(): Promise<void> {
    this.initializeRushStackCompiler();

    const rushStackCompiler: typeof TRushStackCompiler = this._rushStackCompiler as typeof TRushStackCompiler;
    const lintRunner: TRushStackCompiler.LintRunner = new rushStackCompiler.LintRunner(
      {
        displayAsError: this.taskConfig.displayAsError,

        fileError: this.fileError.bind(this),
        fileWarning: this.fileWarning.bind(this)
      },
      this.buildFolder,
      this._terminalProvider
    );

    return lintRunner.invoke();
  }
}
