// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import * as path from 'path';

import { GulpTask } from '@microsoft/gulp-core-build';
import { Executable } from '@microsoft/node-core-library';

export interface IEslintTaskConfig {}

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

export class EslintTask extends GulpTask<IEslintTaskConfig> {
  public constructor() {
    super('eslint', {});
  }

  public async executeTask(): Promise<void> {
    const nodePath: string = process.argv[0];
    const binaryPath: string = path.resolve(__dirname, '..', 'node_modules', 'eslint', 'bin', 'eslint.js');
    const args: string[] = [
      '-f',
      'json',
      path.join(this.buildConfig.srcFolder, '**', '*.{ts,tsx}')
    ];

    const result: childProcess.SpawnSyncReturns<string> = Executable.spawnSync(
      nodePath,
      [binaryPath, ...args],
      {
        currentWorkingDirectory: this.buildConfig.rootPath
      }
    );

    if (result.stderr !== '') {
      this.logError(result.stderr);
    }

    let eslintOutput: IEslintFileOutput[];
    try {
      eslintOutput = JSON.parse(result.stdout);
    } catch (e) {
      throw new Error(`Unable to parse ESLint output: ${e}`);
    }

    let errorCount: number = 0;
    let warningCount: number = 0;

    for (const eslintFile of eslintOutput) {
      errorCount += eslintFile.errorCount;
      errorCount += eslintFile.fixableErrorCount;
      warningCount += eslintFile.warningCount;
      warningCount += eslintFile.fixableWarningCount;

      const filePath: string = path.relative(this.buildConfig.rootPath, eslintFile.filePath);
      for (const message of eslintFile.messages) {
        this.fileWarning(
          filePath,
          message.line,
          message.column,
          message.messageId,
          message.message
        );
      }
    }

    this.logVerbose(`Found ${errorCount} errors`);
    this.logVerbose(`Found ${warningCount} warnings`);

    if (result.status === 0) {
      throw new Error(`Eslint returned error code ${result.status}`);
    }
  }
}
