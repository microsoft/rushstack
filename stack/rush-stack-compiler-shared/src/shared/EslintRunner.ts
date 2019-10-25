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

interface IEslintFileResult {
  // Example: "/full/path/to/File.ts"
  filePath: string;

  // Full content of the source file
  source: string;

  messages: IEslintMessage[];

  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

enum EslintSeverity {
  Off = 0,
  Warn = 1,
  Error = 2
}

interface IEslintMessage {
  // The line number starts at 1
  line: number;
  endLine: number;

  // The column number starts at 1
  column: number;
  endColumn: number;

  // Example: "no-bitwise"
  ruleId: string;

  // Example: "unexpected"
  messageId: string;

  // Example: "Unexpected use of '&'."
  message: string;

  severity: EslintSeverity;

  // Example: "BinaryExpression"
  nodeType: string | null;
}

export class EslintRunner extends RushStackCompilerBase<ILintRunnerConfig> {
  private _cmdRunner: CmdRunner;

  public constructor(taskOptions: ILintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider) {
    super(taskOptions, rootPath, terminalProvider);
    this._cmdRunner = new CmdRunner(
      this._standardBuildFolders,
      this._terminal,
      {
        packagePath: ToolPaths.eslintPackagePath,
        packageJson: ToolPaths.eslintPackageJson,
        packageBinPath: path.join('bin', 'eslint.js')
      }
    );
  }

  public invoke(): Promise<void> {
    const args: string[] = [
      '--format', 'json',
      'src/**/*.{ts,tsx}'
    ];

    const stdoutBuffer: string[] = [];

    return this._cmdRunner.runCmd({
      args: args,
      // ESLint errors are logged to stdout
      onError: (data: Buffer) => {
        this._terminal.writeErrorLine(`Unexpected STDERR output from ESLint: ${data.toString()}`)
      },
      onData: (data: Buffer) => {
        stdoutBuffer.push(data.toString());
      },
      onClose: (code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void) => {
        const dataStr: string = stdoutBuffer.join('');

        try {
          const eslintFileResults: IEslintFileResult[] = JSON.parse(dataStr);

          const eslintErrorLogFn: WriteFileIssueFunction = this._taskOptions.displayAsError
            ? this._taskOptions.fileError
            : this._taskOptions.fileWarning;
          for (const eslintFileResult of eslintFileResults) {
            const pathFromRoot: string = path.relative(this._standardBuildFolders.projectFolderPath,
              eslintFileResult.filePath);
            for (const message of eslintFileResult.messages) {
              eslintErrorLogFn(
                pathFromRoot,
                message.line,
                message.column,
                message.ruleId,
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

        if (this._taskOptions.displayAsError && (code !== 0 || hasErrors)) {
          reject(new Error(`exited with code ${code}`));
        } else {
          resolve();
        }
      }
    });
  }
}
