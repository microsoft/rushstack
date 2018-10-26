// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as typescript from 'typescript';
import { ITerminalProvider } from '@microsoft/node-core-library';

import {
  CmdRunner,
  IRushStackCompilerBaseOptions
} from './CmdRunner';
import { Constants } from './Constants';
import { ToolPaths } from './ToolPaths';
import { RushStackCompilerBase } from './RushStackCompilerBase';

/**
 * @beta
 */
export class TypescriptCompiler extends RushStackCompilerBase<IRushStackCompilerBaseOptions> {
  public typescript: typeof typescript = typescript;
  private _cmdRunner: CmdRunner<IRushStackCompilerBaseOptions>;

  constructor(taskOptions: IRushStackCompilerBaseOptions, constants: Constants, terminalProvider: ITerminalProvider) {
    super(taskOptions, constants, terminalProvider);
    this._cmdRunner = new CmdRunner(
      this._constants,
      this._terminal,
      {
        packagePath: ToolPaths.typescriptPackagePath,
        packageJson: ToolPaths.typescriptPackageJson,
        packageBinPath: path.join('bin', 'tsc'),
        taskOptions
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
          if (!!trimmedLine) {
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
