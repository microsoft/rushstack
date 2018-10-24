// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, Terminal } from '@microsoft/node-core-library';
import * as TSLint from 'tslint';

import {
  BaseCmdTask,
  IBaseCmdTaskOptions
} from './BaseCmdTask';
import { Constants } from './Constants';

export type WriteFileIssueFunction = (
  filePath: string,
  line: number,
  column: number,
  errorCode: string,
  message: string
) => void;

/**
 * @public
 */
export interface ITslintCmdTaskConfig extends IBaseCmdTaskOptions {
  fileError: WriteFileIssueFunction;
  fileWarning: WriteFileIssueFunction;

  /**
   * If true, displays warnings as errors. Defaults to false.
   */
  displayAsError?: boolean;
}

/**
 * @beta
 */
export class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor(taskOptions: ITslintCmdTaskConfig, constants: Constants, terminal: Terminal) {
    super(
      constants,
      terminal,
      {
        packageName: 'tslint',
        packageBinPath: path.join('bin', 'tslint'),
        taskOptions
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'tslint-cmd.schema.json'));
  }

  public invoke(): Promise<void> {
    if (this._customFormatterSpecified) {
      this._terminal.writeVerboseLine(
        'A custom formatter has been specified in customArgs, so the default TSLint error logging ' +
        'has been disabled.'
      );
    }

    return super.invokeCmd();
  }

  protected _getArgs(): string[] {
    const args: string[] = super._getArgs();

    if (!this._customFormatterSpecified) {
      // IFF no custom formatter options are specified by the rig/consumer, use the JSON formatter and
      // log errors using the GCB API
      args.push(...[
        '--format', 'json'
      ]);
    }

    args.push(...[
      '--project', this._constants.srcFolderPath
    ]);

    return args;
  }

  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void {
    if (this._options.taskOptions.displayAsError) {
      super._onClose(code, hasErrors, resolve, reject);
    } else {
      resolve();
    }
  }

  protected _onData(data: Buffer): void {
    if (!this._customFormatterSpecified) {
      const dataStr: string = data.toString().trim();
      const tslintErrorLogFn: (
        filePath: string,
        line: number,
        column: number,
        errorCode: string,
        message: string
      ) => void = this._options.taskOptions.displayAsError
        ? this._options.taskOptions.fileError
        : this._options.taskOptions.fileWarning;

      // TSLint errors are logged to stdout
      try {
        const errors: TSLint.IRuleFailureJson[] = JSON.parse(dataStr);
        for (const error of errors) {
          const pathFromRoot: string = path.relative(this._constants.projectFolderPath, error.name);
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
        this._terminal.writeErrorLine(dataStr);
      }
    }
  }

  private get _customFormatterSpecified(): boolean {
    const customArgs: string[] = super._getArgs();
    return (
      customArgs.indexOf('--formatters-dir') !== -1 ||
      customArgs.indexOf('-s') !== -1 || // Shorthand for "--formatters-dir"
      customArgs.indexOf('--format') !== -1 ||
      customArgs.indexOf('-t') !== -1 // Shorthand for "--format"
    );
  }
}
