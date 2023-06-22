// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import * as semver from 'semver';
import type * as TTypescript from 'typescript';
import type * as TEslint from 'eslint';
import { performance } from 'perf_hooks';
import { FileError } from '@rushstack/node-core-library';

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

  private _eslintPackage: typeof TEslint;
  private _eslint!: TEslint.ESLint;

  public constructor(options: IEslintOptions) {
    super('eslint', options);
    this._eslintPackagePath = options.eslintPackagePath;

    // This must happen before the rest of the linter package is loaded
    this._patchTimer(options.eslintPackagePath);
    this._eslintPackage = require(options.eslintPackagePath);
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

  protected async initializeAsync(tsProgram: TTypescript.Program): Promise<void> {
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

  protected async lintFileAsync(sourceFile: TTypescript.SourceFile): Promise<TEslint.ESLint.LintResult[]> {
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
    let omittedRuleCount: number = 0;
    const timings: [string, number][] = Array.from(this._eslintTimings).sort(
      (x: [string, number], y: [string, number]) => {
        return y[1] - x[1];
      }
    );
    for (const [ruleName, duration] of timings) {
      if (duration > 0) {
        this._terminal.writeVerboseLine(`Rule "${ruleName}" duration: ${duration.toFixed(3)} ms`);
      } else {
        omittedRuleCount++;
      }
    }

    if (omittedRuleCount > 0) {
      this._terminal.writeVerboseLine(`${omittedRuleCount} rules took 0ms`);
    }

    const errors: Error[] = [];
    const warnings: Error[] = [];

    for (const eslintFailure of lintFailures) {
      for (const message of eslintFailure.messages) {
        // https://eslint.org/docs/developer-guide/nodejs-api#◆-lintmessage-type
        const formattedMessage: string = message.ruleId
          ? `(${message.ruleId}) ${message.message}`
          : message.message;
        const errorObject: FileError = new FileError(formattedMessage, {
          absolutePath: eslintFailure.filePath,
          projectFolder: this._buildFolderPath,
          line: message.line,
          column: message.column
        });
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

    for (const error of errors) {
      this._scopedLogger.emitError(error);
    }

    for (const warning of warnings) {
      this._scopedLogger.emitWarning(warning);
    }
  }

  protected async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return await this._eslint.isPathIgnored(filePath);
  }

  private _patchTimer(eslintPackagePath: string): void {
    const timing: IEslintTiming = require(path.join(eslintPackagePath, 'lib', 'linter', 'timing'));
    timing.enabled = true;
    const patchedTime: (
      key: string,
      fn: (...args: unknown[]) => unknown
    ) => (...args: unknown[]) => unknown = (key: string, fn: (...args: unknown[]) => unknown) => {
      return (...args: unknown[]) => {
        const startTime: number = performance.now();
        const result: unknown = fn(...args);
        const endTime: number = performance.now();
        const existingTiming: number = this._eslintTimings.get(key) || 0;
        this._eslintTimings.set(key, existingTiming + endTime - startTime);
        return result;
      };
    };
    timing.time = patchedTime;
  }
}
