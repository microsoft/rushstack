// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ITerminalProvider } from '@rushstack/node-core-library';

import { CmdRunner } from './CmdRunner';
import { ToolPaths } from './ToolPaths';
import {
  RushStackCompilerBase,
  IRushStackCompilerBaseOptions
} from './RushStackCompilerBase';
import { LoggingUtilities } from './LoggingUtilities';

/**
 * @beta
 */
export interface ITypescriptCompilerOptions extends IRushStackCompilerBaseOptions {
  /**
   * Option to pass custom arguments to the tsc command.
   */
  customArgs?: string[];
}

/**
 * @beta
 */
export class TypescriptCompiler extends RushStackCompilerBase<ITypescriptCompilerOptions> {
  private _cmdRunner: CmdRunner;
  public constructor(rootPath: string, terminalProvider: ITerminalProvider) // Remove in the next major version
  public constructor(taskOptions: ITypescriptCompilerOptions, rootPath: string, terminalProvider: ITerminalProvider)
  public constructor(
    arg1: ITypescriptCompilerOptions | string,
    arg2: string | ITerminalProvider,
    arg3?: ITerminalProvider
  ) {
    let taskOptions: ITypescriptCompilerOptions | undefined = undefined;
    let rootPath: string;
    let terminalProvider: ITerminalProvider;
    if (typeof arg1 === 'string') {
      rootPath = arg1;
      terminalProvider = arg2 as ITerminalProvider;
    } else {
      taskOptions = arg1 as ITypescriptCompilerOptions;
      rootPath = arg2 as string;
      terminalProvider = arg3 as ITerminalProvider;
    }

    const loggingUtilities: LoggingUtilities = new LoggingUtilities(terminalProvider);
    if (taskOptions) {
      if (!taskOptions.fileError) {
        taskOptions.fileError = loggingUtilities.fileError;
      }

      if (!taskOptions.fileWarning) {
        taskOptions.fileWarning = loggingUtilities.fileWarning;
      }
    } else {
      taskOptions = loggingUtilities.getDefaultRushStackCompilerBaseOptions();
    }

    super(taskOptions, rootPath, terminalProvider);
    this._cmdRunner = new CmdRunner(
      this._standardBuildFolders,
      this._terminal,
      {
        packagePath: ToolPaths.typescriptPackagePath,
        packageJson: ToolPaths.typescriptPackageJson,
        packageBinPath: path.join('bin', 'tsc')
      }
    );
  }

  public invoke(): Promise<void> {
    return this._cmdRunner.runCmd({
      args: this._taskOptions.customArgs || [],
      onData: (data: Buffer) => {
        // Log lines separately
        const dataLines: (string | undefined)[] = data.toString().split('\n');
        for (const dataLine of dataLines) {
          const trimmedLine: string = (dataLine || '').trim();
          if (trimmedLine) {
            if (trimmedLine.match(/\serror\s/i)) {
              // If the line looks like an error, log it as an error
              this._terminal.writeErrorLine(trimmedLine);
            } else {
              this._terminal.writeLine(trimmedLine);
            }
          }
        }
      }
    });
  }
}
