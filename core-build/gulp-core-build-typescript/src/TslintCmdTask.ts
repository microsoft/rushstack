// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';
import * as TSLint from 'tslint';

import {
  BaseCmdTask,
  IBaseCmdTaskConfig
} from './BaseCmdTask';

/**
 * @public
 */
export interface ITslintCmdTaskConfig extends IBaseCmdTaskConfig {
  /**
   * Optional list of custom args to pass to the tool
   *
   * @remarks
   * Specifying a custom formatter will disable the standard error/warning reporting.
   */
  customArgs?: string[];

  /**
   * If true, displays warnings as errors. Defaults to false.
   */
  displayAsError?: boolean;
}

/**
 * @alpha
 */
export class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor() {
    super(
      'tslint',
      {
        initialTaskConfig: {
          displayAsError: false
        },
        packageName: 'tslint',
        packageBinPath: path.join('bin', 'tslint')
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'tslint-cmd.schema.json'));
  }

  public executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined {
    if (this._customFormatterSpecified) {
      this.logVerbose(
        'A custom formatter has been specified in customArgs, so the default TSLint error logging ' +
        'has been disabled.'
      );
    }

    return super.executeTask(gulp, completeCallback);
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
      '--project', this._buildDirectory
    ]);

    return args;
  }

  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void {
    if (this.taskConfig.displayAsError) {
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
      ) => void = this.taskConfig.displayAsError ? this.fileError.bind(this) : this.fileWarning.bind(this);

      // TSLint errors are logged to stdout
      try {
        const errors: TSLint.IRuleFailureJson[] = JSON.parse(dataStr);
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
        this.logError(dataStr);
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
