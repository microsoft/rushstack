// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'crypto';
import * as semver from 'semver';
import type * as TTypescript from 'typescript';
import type * as TEslint from 'eslint-9';
import { performance } from 'perf_hooks';
import { FileError, FileSystem } from '@rushstack/node-core-library';

import { LinterBase, type ILinterBaseOptions } from './LinterBase';
import type { IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

interface IEslintOptions extends ILinterBaseOptions {
  eslintPackage: typeof TEslint;
  eslintTimings: Map<string, number>;
}

interface IEslintTiming {
  enabled: boolean;
  time: (key: string, fn: (...args: unknown[]) => void) => (...args: unknown[]) => void;
}

enum EslintMessageSeverity {
  warning = 1,
  error = 2
}

// Patch the timer used to track rule execution time. This allows us to get access to the detailed information
// about how long each rule took to execute, which we provide on the CLI when running in verbose mode.
async function patchTimerAsync(eslintPackagePath: string, timingsMap: Map<string, number>): Promise<void> {
  const timingModulePath: string = `${eslintPackagePath}/lib/linter/timing`;
  const timing: IEslintTiming = (await import(timingModulePath)).default;
  timing.enabled = true;
  const patchedTime: (key: string, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown = (
    key: string,
    fn: (...args: unknown[]) => unknown
  ) => {
    return (...args: unknown[]) => {
      const startTime: number = performance.now();
      const result: unknown = fn(...args);
      const endTime: number = performance.now();
      const existingTiming: number = timingsMap.get(key) || 0;
      timingsMap.set(key, existingTiming + endTime - startTime);
      return result;
    };
  };
  timing.time = patchedTime;
}

function getFormattedErrorMessage(lintMessage: TEslint.Linter.LintMessage): string {
  // https://eslint.org/docs/developer-guide/nodejs-api#◆-lintmessage-type
  return lintMessage.ruleId ? `(${lintMessage.ruleId}) ${lintMessage.message}` : lintMessage.message;
}

export class Eslint extends LinterBase<TEslint.ESLint.LintResult> {
  private readonly _eslintPackage: typeof TEslint;
  private readonly _linter: TEslint.ESLint;
  private readonly _eslintTimings: Map<string, number> = new Map();
  private readonly _currentFixMessages: TEslint.Linter.LintMessage[] = [];
  private readonly _fixMessagesByResult: Map<TEslint.ESLint.LintResult, TEslint.Linter.LintMessage[]> =
    new Map();
  private readonly _sarifLogPath: string | undefined;

  protected constructor(options: IEslintOptions) {
    super('eslint', options);

    const {
      buildFolderPath,
      eslintPackage,
      linterConfigFilePath,
      tsProgram,
      eslintTimings,
      fix,
      sarifLogPath
    } = options;
    this._eslintPackage = eslintPackage;
    this._sarifLogPath = sarifLogPath;

    let overrideConfig: TEslint.Linter.Config | undefined;
    let fixFn: Exclude<TEslint.ESLint.Options['fix'], boolean>;
    if (fix) {
      // We do not recieve the messages for the issues that were fixed, so we need to track them ourselves
      // so that we can log them after the fix is applied. This array will be populated by the fix function,
      // and subsequently mapped to the results in the ESLint.lintFileAsync method below. After the messages
      // are mapped, the array will be cleared so that it is ready for the next fix operation.
      fixFn = (message: TEslint.Linter.LintMessage) => {
        this._currentFixMessages.push(message);
        return true;
      };
    } else {
      // The @typescript-eslint/parser package allows providing an existing TypeScript program to avoid needing
      // to reparse. However, fixers in ESLint run in multiple passes against the underlying code until the
      // fix fully succeeds. This conflicts with providing an existing program as the code no longer maps to
      // the provided program, producing garbage fix output. To avoid this, only provide the existing program
      // if we're not fixing.
      overrideConfig = {
        languageOptions: {
          parserOptions: {
            programs: [tsProgram]
          }
        }
      };
    }

    this._linter = new eslintPackage.ESLint({
      cwd: buildFolderPath,
      overrideConfigFile: linterConfigFilePath,
      // Override config takes precedence over overrideConfigFile
      overrideConfig,
      fix: fixFn
    });
    this._eslintTimings = eslintTimings;
  }

  public static async initializeAsync(options: ILinterBaseOptions): Promise<Eslint> {
    const { linterToolPath } = options;
    const eslintTimings: Map<string, number> = new Map();
    // This must happen before the rest of the linter package is loaded
    await patchTimerAsync(linterToolPath, eslintTimings);

    const eslintPackage: typeof TEslint = await import(linterToolPath);
    return new Eslint({
      ...options,
      eslintPackage,
      eslintTimings
    });
  }

  public override printVersionHeader(): void {
    const linterVersion: string = this._eslintPackage.Linter.version;
    this._terminal.writeLine(`Using ESLint version ${linterVersion}`);

    const majorVersion: number = semver.major(linterVersion);
    if (majorVersion < 9) {
      throw new Error('Heft requires ESLint 9 or newer.  Your ESLint version is too old');
    } else if (majorVersion > 9) {
      // We don't use writeWarningLine() here because, if the person wants to take their chances with
      // a newer ESLint release, their build should be allowed to succeed.
      this._terminal.writeLine(
        'The ESLint version is newer than the latest version that was tested with Heft, so it may not work correctly.'
      );
    }
  }

  protected override async getCacheVersionAsync(): Promise<string> {
    return `${this._eslintPackage.Linter.version}_${process.version}`;
  }

  protected override async getSourceFileHashAsync(sourceFile: IExtendedSourceFile): Promise<string> {
    // Since the original hash can either come from TypeScript or from manually hashing the file, we can just
    // append the config hash to the original hash to avoid reducing the hash space. This is not a perfect
    // solution, but it is good enough for our purposes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceFileEslintConfiguration: any = await this._linter.calculateConfigForFile(sourceFile.fileName);
    const hash: Hash = createHash('sha1');
    try {
      hash.update(JSON.stringify(sourceFileEslintConfiguration));
    } catch (e) {
      throw e;
    }
    const originalSourceFileHash: string = await super.getSourceFileHashAsync(sourceFile);
    return `${hash.digest('base64')}_${originalSourceFileHash}`;
  }

  protected override async lintFileAsync(
    sourceFile: TTypescript.SourceFile
  ): Promise<TEslint.ESLint.LintResult[]> {
    const lintResults: TEslint.ESLint.LintResult[] = await this._linter.lintText(sourceFile.text, {
      filePath: sourceFile.fileName
    });

    // Map the fix messages to the results. This API should only return one result per file, so we can be sure
    // that the fix messages belong to the returned result. If we somehow receive multiple results, we will
    // drop the messages on the floor, but since they are only used for logging, this should not be a problem.
    const fixMessages: TEslint.Linter.LintMessage[] = this._currentFixMessages.splice(0);
    if (lintResults.length === 1) {
      this._fixMessagesByResult.set(lintResults[0], fixMessages);
    }

    this._fixesPossible =
      this._fixesPossible ||
      (!this._fix &&
        lintResults.some((lintResult: TEslint.ESLint.LintResult) => {
          return lintResult.fixableErrorCount + lintResult.fixableWarningCount > 0;
        }));

    const trimmedLintResults: TEslint.ESLint.LintResult[] = [];
    for (const lintResult of lintResults) {
      if (
        lintResult.messages.length > 0 ||
        lintResult.warningCount > 0 ||
        lintResult.errorCount > 0 ||
        fixMessages.length > 0
      ) {
        trimmedLintResults.push(lintResult);
      }
    }

    return trimmedLintResults;
  }

  protected override async lintingFinishedAsync(lintResults: TEslint.ESLint.LintResult[]): Promise<void> {
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

    if (this._fix && this._fixMessagesByResult.size > 0) {
      await this._eslintPackage.ESLint.outputFixes(lintResults);
    }

    for (const lintResult of lintResults) {
      // Report linter fixes to the logger. These will only be returned when the underlying failure was fixed
      const fixMessages: TEslint.Linter.LintMessage[] | undefined = this._fixMessagesByResult.get(lintResult);
      if (fixMessages) {
        for (const fixMessage of fixMessages) {
          const formattedMessage: string = `[FIXED] ${getFormattedErrorMessage(fixMessage)}`;
          const errorObject: FileError = this._getLintFileError(lintResult, fixMessage, formattedMessage);
          this._scopedLogger.emitWarning(errorObject);
        }
      }

      // Report linter errors and warnings to the logger
      for (const lintMessage of lintResult.messages) {
        const errorObject: FileError = this._getLintFileError(lintResult, lintMessage);
        switch (lintMessage.severity) {
          case EslintMessageSeverity.error: {
            this._scopedLogger.emitError(errorObject);
            break;
          }

          case EslintMessageSeverity.warning: {
            this._scopedLogger.emitWarning(errorObject);
            break;
          }
        }
      }
    }

    const sarifLogPath: string | undefined = this._sarifLogPath;
    if (sarifLogPath) {
      const rulesMeta: TEslint.ESLint.LintResultData['rulesMeta'] =
        this._linter.getRulesMetaForResults(lintResults);
      const { formatEslintResultsAsSARIF } = await import('./SarifFormatter');
      const sarifString: string = JSON.stringify(
        formatEslintResultsAsSARIF(lintResults, rulesMeta, {
          ignoreSuppressed: false,
          eslintVersion: this._eslintPackage.ESLint.version,
          buildFolderPath: this._buildFolderPath
        }),
        undefined,
        2
      );

      await FileSystem.writeFileAsync(sarifLogPath, sarifString, { ensureFolderExists: true });
    }
  }

  protected override async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return await this._linter.isPathIgnored(filePath);
  }

  private _getLintFileError(
    lintResult: TEslint.ESLint.LintResult,
    lintMessage: TEslint.Linter.LintMessage,
    message?: string
  ): FileError {
    if (!message) {
      message = getFormattedErrorMessage(lintMessage);
    }

    return new FileError(message, {
      absolutePath: lintResult.filePath,
      projectFolder: this._buildFolderPath,
      line: lintMessage.line,
      column: lintMessage.column
    });
  }
}
