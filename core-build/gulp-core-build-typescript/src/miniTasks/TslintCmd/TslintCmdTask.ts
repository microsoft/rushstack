// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Gulp from 'gulp';
import * as path from 'path';
import {
  JsonFile,
  IPackageJson
} from '@microsoft/node-core-library';
import * as fsx from 'fs-extra';
import * as TSLint from 'tslint';

import {
  BaseCmdTask,
  ICallCmdOptions
} from '../BaseCmdTask';

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

  /**
   * If true, displays warnings as errors. Defaults to false.
   */
  displayAsError?: boolean;
}

/**
 * @public
 */
export class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor() {
    super(
      'tslint',
      {
        displayAsError: false
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, '..', '..', 'schemas', 'tslint-cmd.schema.json'));
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

    const callCmdOptions: Partial<ICallCmdOptions> = {};
    if (!this.taskConfig.displayAsError) {
      callCmdOptions.onClose = (code: number, hasErrors: boolean, resolve: () => void) => {
        resolve();
      };
    }

    const customArgs: string[] = this.taskConfig.customArgs || [];
    const additionalArgs: string[] = [];
    if (
      customArgs.indexOf('--formatters-dir') === -1 &&
      customArgs.indexOf('-s') === -1 && // Shorthand for "--formatters-dir"
      customArgs.indexOf('--format') === -1 &&
      customArgs.indexOf('-t') === -1 // Shorthand for "--format"
    ) {
      // IFF no custom formatter options are specified by the rig/consumer, use the JSON formatter and
      // log errors using the GCB API
      additionalArgs.push(...[
        '--format', 'json'
      ]);

      const tslintErrorLogFn: (
        filePath: string,
        line: number,
        column: number,
        errorCode: string,
        message: string
      ) => void = this.taskConfig.displayAsError ? this.fileError.bind(this) : this.fileWarning.bind(this);

      // TSLint errors are logged to stdout
      callCmdOptions.onData = (data: Buffer) => {
        try {
          const errorJson: string = data.toString().trim();

          const errors: TSLint.IRuleFailureJson[] = JSON.parse(errorJson);
          for (const error of errors) {
            const pathFromRoot: string = path.relative(this.buildConfig.rootPath, error.name);
            tslintErrorLogFn(
              pathFromRoot,
              error.startPosition.line + 1,
              error.startPosition.character + 1,
              error.ruleName,
              error.failure
            );
          }
        } catch (e) {
          // If we fail to parse the JSON, it's likely TSLint encountered an error parsing the config file,
          // or it experienced an inner error. In this case, log the output as an error regardless of the
          // displayAsError value
          this._logBuffer(data, this.logError.bind(this));
        }
      };
    }

    return this._callCmd(
      tslintBinaryPath,
      buildDirectory,
      [
        '--project',
        buildDirectory,
        ...additionalArgs,
        ...customArgs
      ],
      callCmdOptions
    );
  }
}
