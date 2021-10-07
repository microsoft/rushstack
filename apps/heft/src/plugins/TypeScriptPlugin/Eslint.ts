// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import * as semver from 'semver';
import * as TEslint from 'eslint';
import type { SourceFile, Program } from 'typescript';

import { Import } from '@rushstack/node-core-library';
import { LinterBase, ILinterBaseOptions, ITiming } from './LinterBase';
import { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';
import { FileError } from '../../pluginFramework/logging/FileError';

interface IEslintOptions extends ILinterBaseOptions {
  eslintPackagePath: string;
}

interface IEslintTiming {
  enabled: boolean;
  time: (key: string, fn: (...args: unknown[]) => void) => (...args: unknown[]) => void;
}

interface IAstAndProgram {
  ast: SourceFile;
  program: Program;
}

interface IEstreeCreateProjectProgram {
  createProjectProgram: (
    code: string,
    createDefaultProgram: boolean,
    extra: unknown
  ) => IAstAndProgram | undefined;
}

interface IEstreeUseProvidedPrograms {
  useProvidedPrograms: (programInstances: Iterable<Program>, extra: unknown) => IAstAndProgram | undefined;
}

const enum EslintMessageSeverity {
  warning = 1,
  error = 2
}

export class Eslint extends LinterBase<TEslint.ESLint.LintResult> {
  private static readonly _sourceFilePrograms: Set<IExtendedProgram> = new Set();

  private readonly _eslintPackagePath: string;
  private readonly _eslintPackage: typeof TEslint;
  private readonly _eslintTimings: Map<string, string> = new Map<string, string>();

  private _eslint!: TEslint.ESLint;
  private _eslintBaseConfiguration: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  private _lintResult!: TEslint.ESLint.LintResult[];

  private _tsProgram: IExtendedProgram | undefined;

  public constructor(options: IEslintOptions) {
    super('eslint', options);

    // This must happen before the rest of the linter package is loaded
    this._patchTimer(options.eslintPackagePath);
    this._patchEstreeParser(options.eslintPackagePath);

    this._eslintPackagePath = options.eslintPackagePath;
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
    if (majorVersion > 7) {
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

  protected get cacheVersion(): string {
    const eslintConfigHash: crypto.Hash = crypto
      .createHash('sha1')
      .update(JSON.stringify(this._eslintBaseConfiguration));
    const eslintConfigVersion: string = `${this._eslintPackage.Linter.version}_${eslintConfigHash.digest(
      'hex'
    )}`;

    return eslintConfigVersion;
  }

  protected async initializeAsync(tsProgram: IExtendedProgram): Promise<void> {
    Eslint._sourceFilePrograms.add(tsProgram);

    this._eslint = new this._eslintPackage.ESLint({
      cwd: this._buildFolderPath,
      overrideConfigFile: this._linterConfigFilePath
    });

    this._eslintBaseConfiguration = await this._eslint.calculateConfigForFile(this._linterConfigFilePath);
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

  private _patchEstreeParser(eslintPackagePath: string): void {
    // While intercepting the "parse" method to inject our programs would be a better way to provide
    // the programs, the method used to calculate the configuration is an instance member of the
    // Eslint class, which means we would need to construct the linter to extract a config, modify the
    // config.parse method to inject our programs, and then re-construct the linter using this config.
    // Using this patch allows us to avoid initializing ESLint twice while still providing the programs.
    const estreePackagePath: string = Import.resolvePackage({
      baseFolderPath: eslintPackagePath,
      packageName: '@typescript-eslint/typescript-estree'
    });
    const createProjectProgram: IEstreeCreateProjectProgram = require(`${estreePackagePath}/dist/create-program/createProjectProgram`);
    const useProvidedPrograms: IEstreeUseProvidedPrograms = require(`${estreePackagePath}/dist/create-program/useProvidedPrograms`);

    const originalCreateProgramFunc: typeof createProjectProgram.createProjectProgram =
      createProjectProgram.createProjectProgram.bind(createProjectProgram);
    createProjectProgram.createProjectProgram = (
      code: string,
      createDefaultProgram: boolean,
      extra: unknown
    ) => {
      return Eslint._sourceFilePrograms.size
        ? useProvidedPrograms.useProvidedPrograms(Eslint._sourceFilePrograms, extra)
        : originalCreateProgramFunc(code, createDefaultProgram, extra);
    };
  }
}
