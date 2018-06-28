// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Gulp from 'gulp';
import * as path from 'path';
import {
  JsonFile,
  IPackageJson
} from '@microsoft/node-core-library';
import * as fsx from 'fs-extra';

import { BaseCmdTask } from './BaseCmdTask';

/**
 * @public
 */
export interface ITslintCmdTaskConfig {
  /**
   * The path to the tslint package if the task should override the version of tslint.
   */
  tslintPackagePath?: string;

  /**
   * Optional list of custom args to pass to "tslint"
   */
  customArgs?: string[];

  /**
   * The directory in which tslint should be invoked.
   */
  buildDirectory?: string;
}

/**
 * @public
 */
export class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor() {
    super('tslint');
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, '..', 'schemas', 'tslint-cmd.schema.json'));
  }

  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): Promise<void> | undefined {
    // require.resolve('tslint') resolves to <package>/lib/index.ts, and we want the package path
    let tslintPackagePath: string = path.resolve(require.resolve('tslint'), '..', '..');
    // Find the "tslint" executable
    if (this.taskConfig.tslintPackagePath) {
      // The tslint version is being overridden
      if (!fsx.existsSync(this.taskConfig.tslintPackagePath)) {
        completeCallback(
          `The specified tslint tool path (${this.taskConfig.tslintPackagePath}) does not ` +
          'exist'
        );
        return;
      }

      tslintPackagePath = this.taskConfig.tslintPackagePath;
    }

    const buildDirectory: string = this.taskConfig.buildDirectory || this.buildConfig.rootPath;

    // Print the version
    const packageJson: IPackageJson = JsonFile.load(path.join(tslintPackagePath, 'package.json'));
    this.log(`TSLint version: ${packageJson.version}`);

    const tslintBinaryPath: string = path.resolve(tslintPackagePath, 'bin', 'tslint');
    if (!fsx.existsSync(tslintBinaryPath)) {
      completeCallback('The tslint binary is missing. This indicates that tslint is not installed correctly.');
      return;
    }

    return this._callCmd(tslintBinaryPath, buildDirectory, this.taskConfig.customArgs || []);
  }
}
