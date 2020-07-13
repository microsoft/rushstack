// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import * as TEslint from 'eslint';

import { LinterBase, ILinterBaseOptions, ITiming } from './LinterBase';
import { IExtendedSourceFile } from './internalTypings/TypeScriptInternals';
import { IColorableSequence, Colors } from '@rushstack/node-core-library';

interface IEslintOptions extends ILinterBaseOptions {
  eslintPackagePath: string;
}

interface IEslintTiming {
  enabled: boolean;
  time: (key: string, fn: (...args: unknown[]) => void) => (...args: unknown[]) => void;
}

const enum EslintMessageSeverity {
  warning = 1,
  error = 2
}

export class Eslint extends LinterBase<TEslint.ESLint.LintResult> {
  private readonly _eslintPackage: typeof TEslint;
  private readonly _eslintTimings: Map<string, string> = new Map<string, string>();

  private _eslintCli: TEslint.CLIEngine;
  private _eslint: TEslint.ESLint;
  private _eslintBaseConfiguration: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  private _lintResult: TEslint.ESLint.LintResult[];

  public constructor(options: IEslintOptions) {
    super('eslint', options);

    this._patchTimer(options.eslintPackagePath); // This must happen before the rest of the linter package is loaded

    this._eslintPackage = require(options.eslintPackagePath);
  }

  public printVersionHeader(): void {
    this._terminal.writeLine(`Using ESLint version ${this._eslintPackage.Linter.version}`);
  }

  public reportFailures(): void {
    const eslintFailureLogMessages: (string | IColorableSequence)[][] = [];

    for (const eslintFileResult of this._lintResult) {
      const buildFolderRelativeFilePath: string = path.relative(
        this._buildFolderPath,
        eslintFileResult.filePath
      );
      for (const message of eslintFileResult.messages) {
        // https://eslint.org/docs/developer-guide/nodejs-api#◆-lintmessage-type
        const severity: string = message.severity === EslintMessageSeverity.warning ? 'WARNING' : 'ERROR';
        eslintFailureLogMessages.push([
          '  ',
          Colors.yellow(`${severity}: ${buildFolderRelativeFilePath}:${message.line}:${message.column}`),
          ' - ',
          Colors.yellow(message.ruleId ? `(${message.ruleId}) ${message.message}` : message.message)
        ]);
      }
    }

    if (eslintFailureLogMessages.length > 0) {
      this._terminal.writeWarningLine(
        `Encountered ${eslintFailureLogMessages.length} ESLint error${
          eslintFailureLogMessages.length > 1 ? 's' : ''
        }:`
      );
      for (const eslintFailureLogMessage of eslintFailureLogMessages) {
        this._terminal.writeWarningLine(...eslintFailureLogMessage);
      }
    }
  }

  protected get cacheVersion(): string {
    const eslintConfigHash: crypto.Hash = crypto
      .createHash('sha1')
      .update(JSON.stringify(this._eslintBaseConfiguration));
    const eslintConfigVersion: string = `${this._eslintPackage.Linter.version}_${eslintConfigHash.digest(
      'hex'
    )}`;

    return eslintConfigVersion;
  }

  protected async initializeAsync(): Promise<void> {
    this._eslint = new this._eslintPackage.ESLint({
      cwd: this._buildFolderPath,
      overrideConfigFile: this._linterConfigFilePath
    });

    this._eslintBaseConfiguration = await this._eslint.calculateConfigForFile(this._linterConfigFilePath);

    this._eslintCli = new this._eslintPackage.CLIEngine({
      cwd: this._buildFolderPath,
      configFile: this._linterConfigFilePath
    });
  }

  protected lintFile(sourceFile: IExtendedSourceFile): TEslint.ESLint.LintResult[] {
    const lintResults: TEslint.ESLint.LintResult[] = this._eslintCli.executeOnText(
      sourceFile.text,
      sourceFile.fileName
    ).results;
    const failures: TEslint.ESLint.LintResult[] = [];
    for (const lintResult of lintResults) {
      if (lintResult.messages.length > 0) {
        failures.push(lintResult);
      }
    }

    return failures;
  }

  protected lintingFinished(lintFailures: TEslint.ESLint.LintResult[]): void {
    this._lintResult = lintFailures;

    let omittedRuleCount: number = 0;
    for (const [ruleName, measurementName] of this._eslintTimings.entries()) {
      const timing: ITiming = this.getTiming(measurementName);
      if (timing.duration > 0) {
        this._terminal.writeVerboseLine(`Rule "${ruleName}" duration: ${timing.duration}ms`);
      } else {
        omittedRuleCount++;
      }
    }

    if (omittedRuleCount > 0) {
      this._terminal.writeVerboseLine(`${omittedRuleCount} rules took 0ms`);
    }
  }

  protected async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return await this._eslint.isPathIgnored(filePath);
  }

  private _patchTimer(eslintPackagePath: string): void {
    const timing: IEslintTiming = require(path.join(eslintPackagePath, 'lib', 'linter', 'timing'));
    timing.enabled = true;
    timing.time = (key: string, fn: (...args: unknown[]) => void) => {
      const timingName: string = `Eslint${key}`;
      this._eslintTimings.set(key, timingName);
      return (...args: unknown[]) => this._measurePerformance(timingName, () => fn(...args));
    };
  }
}
