// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ITerminalProvider, FileSystem } from '@microsoft/node-core-library';

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

  constructor(taskOptions: ILintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider) {
    super(taskOptions, rootPath, terminalProvider);

    this._eslintRunner = new EslintRunner(taskOptions, rootPath, terminalProvider);
    this._tslintRunner = new TslintRunner(taskOptions, rootPath, terminalProvider);
  }

  public invoke(): Promise<void> {
    const filePath: string = path.join(this._standardBuildFolders.projectFolderPath, 'tslint.json');
    if (FileSystem.exists(filePath)) {
      return this._tslintRunner.invoke();
    } else {
      return this._eslintRunner.invoke();
    }
  }
}
