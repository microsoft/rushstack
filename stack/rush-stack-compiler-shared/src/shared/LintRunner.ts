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
    const tslintFilePath: string = path.join(this._standardBuildFolders.projectFolderPath, 'tslint.json');

    let promise: Promise<void> = Promise.resolve();

    if (FileSystem.exists(tslintFilePath)) {
      promise = promise.then(() => this._tslintRunner.invoke());
    }

    // ESLint supports a crazy amount of different filenames and formats for its config file.  To reduce
    // pointless inconsistency, we only support JSON and JavaScript.  They are the most conventional formats,
    // and have useful tradeoffs:  JSON is deterministic, whereas JavaScript enables certain workarounds
    // for limitations of the format.
    const eslintFilePath1: string = path.join(this._standardBuildFolders.projectFolderPath, '.eslintrc.js');
    const eslintFilePath2: string = path.join(this._standardBuildFolders.projectFolderPath, '.eslintrc.json');

    if (FileSystem.exists(eslintFilePath1) || FileSystem.exists(eslintFilePath2)) {
      promise = promise.then(() => this._eslintRunner.invoke());
    }

    return promise;
  }
}
