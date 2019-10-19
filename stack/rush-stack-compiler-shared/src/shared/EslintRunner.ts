// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ITerminalProvider } from '@microsoft/node-core-library';

import { CmdRunner } from './CmdRunner';
import { ToolPaths } from './ToolPaths';
import { ILintRunnerConfig } from './ILintRunnerConfig';
import {
  RushStackCompilerBase,
  WriteFileIssueFunction
} from './RushStackCompilerBase';

interface IEslintFileOutput {
  filePath: string;
  messages: IEslintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  source: string;
}

interface IEslintMessage {
  ruleId: string;
  severity: number;
  message: string;
  line: number;
  column: number;
  nodeType: string;
  messageId: string;
  endLine: number;
  endColumn: number;
}

export class EslintRunner extends RushStackCompilerBase<ILintRunnerConfig> {
  private _cmdRunner: CmdRunner;

  constructor(taskOptions: ILintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider) {
    super(taskOptions, rootPath, terminalProvider);
    this._cmdRunner = new CmdRunner(
      this._standardBuildFolders,
      this._terminal,
      {
        packagePath: ToolPaths.eslintPackagePath,
        packageJson: ToolPaths.eslintPackageJson,
        packageBinPath: path.join('bin', 'eslint')
      }
    );
  }

  public invoke(): Promise<void> {
    const args: string[] = [
      '--format', 'json',
      'src/**/*.{ts,tsx}'
    ];

    return this._cmdRunner.runCmd({
      args: args,
      onData: (data: Buffer) => {
        const dataStr: string = data.toString().trim();
        const eslintErrorLogFn: WriteFileIssueFunction = this._taskOptions.displayAsError
          ? this._taskOptions.fileError
          : this._taskOptions.fileWarning;

        // ESLint errors are logged to stdout
        try {
          const eslintOutput: IEslintFileOutput[] = JSON.parse(dataStr);
          for (const eslintFileOutput of eslintOutput) {
            const pathFromRoot: string = path.relative(this._standardBuildFolders.projectFolderPath,
              eslintFileOutput.filePath);
            for (const message of eslintFileOutput.messages) {
              eslintErrorLogFn(
                pathFromRoot,
                message.line,
                message.column,
                message.messageId,
                message.message
              );
            }
          }
        } catch (e) {
          // If we fail to parse the JSON, it's likely ESLint encountered an error parsing the config file,
          // or it experienced an inner error. In this case, log the output as an error regardless of the
          // displayAsError value
          this._terminal.writeErrorLine(dataStr);
        }
      },
      onClose: (code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void) => {
        if (this._taskOptions.displayAsError && (code !== 0 || hasErrors)) {
          reject(new Error(`exited with code ${code}`));
        } else {
          resolve();
        }
      }
    });
  }
}
