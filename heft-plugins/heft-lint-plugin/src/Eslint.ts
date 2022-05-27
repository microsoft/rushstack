// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import * as semver from 'semver';
import type * as TEslint from 'eslint';
import { performance } from 'perf_hooks';
import { FileError } from '@rushstack/node-core-library';
import type { IExtendedProgram, IExtendedSourceFile } from '@rushstack/heft-typescript-plugin';

import { LinterBase, type ILinterBaseOptions } from './LinterBase';

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
  private readonly _eslintPackagePath: string;
  private readonly _eslintTimings: Map<string, number> = new Map();

  private _eslintPackage!: typeof TEslint;
  private _eslint!: TEslint.ESLint;
  private _lintResult!: TEslint.ESLint.LintResult[];

  private constructor(options: IEslintOptions) {
    super('eslint', options);
    this._eslintPackagePath = options.eslintPackagePath;
  }

  public static async loadAsync(options: IEslintOptions): Promise<Eslint> {
    const eslint: Eslint = new Eslint(options);

    // This must happen before the rest of the linter package is loaded
    await eslint._patchTimerAsync(options.eslintPackagePath);
    eslint._eslintPackage = require(options.eslintPackagePath);

    return eslint;
  }

  public printVersionHeader(): void {
    this._terminal.writeLine(`Using ESLint version ${this._eslintPackage.Linter.version}`);

    const majorVersion: number = semver.major(this._eslintPackage.Linter.version);
    if (majorVersion < 7) {
      throw new Error(
        'Heft requires ESLint 7 or newer.  Your ESLint version is too old:\n' + this._eslintPackagePath
      );
    }
    if (majorVersion > 8) {
      // We don't use writeWarningLine() here because, if the person wants to take their chances with
      // a newer ESLint release, their build should be allowed to succeed.
      this._terminal.writeLine(
        'The ESLint version is newer than the latest version that was tested with Heft; it may not work correctly:'
      );
      this._terminal.writeLine(this._eslintPackagePath);
    }
  }

  public reportFailures(): void {
    let eslintFailureCount: number = 0;
    const errors: Error[] = [];
    const warnings: Error[] = [];

    for (const eslintFileResult of this._lintResult) {
      const buildFolderRelativeFilePath: string = path.relative(
        this._buildFolderPath,
        eslintFileResult.filePath
      );
      for (const message of eslintFileResult.messages) {
        eslintFailureCount++;
        // https://eslint.org/docs/developer-guide/nodejs-api#◆-lintmessage-type
        const formattedMessage: string = message.ruleId
          ? `(${message.ruleId}) ${message.message}`
          : message.message;
        const errorObject: FileError = new FileError(
          formattedMessage,
          buildFolderRelativeFilePath,
          message.line,
          message.column
        );
        switch (message.severity) {
          case EslintMessageSeverity.error: {
            errors.push(errorObject);
            break;
          }

          case EslintMessageSeverity.warning: {
            warnings.push(errorObject);
            break;
          }
        }
      }
    }

    if (eslintFailureCount > 0) {
      this._terminal.writeLine(
        `Encountered ${eslintFailureCount} ESLint issue${eslintFailureCount > 1 ? 's' : ''}:`
      );
    }

    for (const error of errors) {
      this._scopedLogger.emitError(error);
    }

    for (const warning of warnings) {
      this._scopedLogger.emitWarning(warning);
    }
  }

  protected async getCacheVersionAsync(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eslintBaseConfiguration: any = await this._eslint.calculateConfigForFile(
      this._linterConfigFilePath
    );
    const eslintConfigHash: crypto.Hash = crypto
      .createHash('sha1')
      .update(JSON.stringify(eslintBaseConfiguration));
    const eslintConfigVersion: string = `${this._eslintPackage.Linter.version}_${eslintConfigHash.digest(
      'hex'
    )}`;

    return eslintConfigVersion;
  }

  protected async initializeAsync(tsProgram: IExtendedProgram): Promise<void> {
    // Override config takes precedence over overrideConfigFile, which allows us to provide
    // the source TypeScript program.
    this._eslint = new this._eslintPackage.ESLint({
      cwd: this._buildFolderPath,
      overrideConfigFile: this._linterConfigFilePath,
      overrideConfig: {
        parserOptions: {
          programs: [tsProgram]
        }
      }
    });
  }

  protected async lintFileAsync(sourceFile: IExtendedSourceFile): Promise<TEslint.ESLint.LintResult[]> {
    const lintResults: TEslint.ESLint.LintResult[] = await this._eslint.lintText(sourceFile.text, {
      filePath: sourceFile.fileName
    });

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
    for (const [ruleName, duration] of this._eslintTimings.entries()) {
      if (duration > 0) {
        this._terminal.writeVerboseLine(`Rule "${ruleName}" duration: ${duration}ms`);
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

  private async _patchTimerAsync(eslintPackagePath: string): Promise<void> {
    const timing: IEslintTiming = require(path.join(eslintPackagePath, 'lib', 'linter', 'timing'));
    timing.enabled = true;
    const patchedTime: (key: string, fn: (...args: unknown[]) => void) => (...args: unknown[]) => void = (
      key: string,
      fn: (...args: unknown[]) => void
    ) => {
      return (...args: unknown[]) => {
        const startTime: number = performance.now();
        fn(...args);
        const endTime: number = performance.now();
        const existingTiming: number = this._eslintTimings.get(key) || 0;
        this._eslintTimings.set(key, existingTiming + endTime - startTime);
      };
    };
    timing.time = patchedTime;
  }
}
