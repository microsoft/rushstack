// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ITerminalProvider, FileSystem } from '@rushstack/node-core-library';

import { TslintRunner } from './TslintRunner';
import { EslintRunner } from './EslintRunner';

import { ILintRunnerConfig } from './ILintRunnerConfig';
import { RushStackCompilerBase } from './RushStackCompilerBase';

/**
 * @beta
 */
export class LintRunner extends RushStackCompilerBase<ILintRunnerConfig> {
  private _eslintRunner: EslintRunner;
  private _tslintRunner: TslintRunner;

  public constructor(taskOptions: ILintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider) {
    super(taskOptions, rootPath, terminalProvider);

    this._eslintRunner = new EslintRunner(taskOptions, rootPath, terminalProvider);
    this._tslintRunner = new TslintRunner(taskOptions, rootPath, terminalProvider);
  }

  public async invoke(): Promise<void> {
    const tslintFilePath: string = path.join(this._standardBuildFolders.projectFolderPath, 'tslint.json');

    if (FileSystem.exists(tslintFilePath)) {
      await this._tslintRunner.invoke();
    }

    // ESLint supports too many different filenames and formats for its config file.  To avoid
    // needless inconsistency, we only support JSON and JavaScript.  They are the most conventional formats,
    // and have useful tradeoffs:  JSON is deterministic, whereas JavaScript enables certain workarounds
    // for limitations of the format.
    const eslintFilePath1: string = path.join(this._standardBuildFolders.projectFolderPath, '.eslintrc.js');
    const eslintFilePath2: string = path.join(this._standardBuildFolders.projectFolderPath, '.eslintrc.json');

    if (FileSystem.exists(eslintFilePath1) || FileSystem.exists(eslintFilePath2)) {
      await this._eslintRunner.invoke();
    }
  }
}
