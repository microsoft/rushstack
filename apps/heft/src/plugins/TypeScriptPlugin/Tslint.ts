// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Tslint as TTslint } from '@microsoft/rush-stack-compiler-3.7';
import * as crypto from 'crypto';

import { LinterBase, ILinterBaseOptions } from './LinterBase';
import { IExtendedSourceFile, IExtendedProgram } from './internalTypings/TypeScriptInternals';
import { Terminal, JsonFile, Colors } from '@rushstack/node-core-library';
import { IExtendedFileSystem } from '../../utilities/fileSystem/IExtendedFileSystem';
import { ResolveUtilities } from '../../utilities/ResolveUtilities';
import { IExtendedLinter } from './internalTypings/TslintInternals';

interface ITslintOptions extends ILinterBaseOptions {
  tslintPackagePath: string;

  fileSystem: IExtendedFileSystem;
}

export class Tslint extends LinterBase<TTslint.RuleFailure> {
  private readonly _tslint: typeof TTslint;
  private readonly _fileSystem: IExtendedFileSystem;

  private _tslintConfiguration: TTslint.Configuration.IConfigurationFile;
  private _linter: IExtendedLinter;
  private _enabledRules: TTslint.IRule[];
  private _ruleSeverityMap: Map<string, TTslint.RuleSeverity>;
  protected _lintResult: TTslint.LintResult;

  public constructor(options: ITslintOptions) {
    super('tslint', options);

    this._tslint = require(options.tslintPackagePath);
    this._fileSystem = options.fileSystem;
  }

  public static getConfigHash(
    configFilePath: string,
    terminal: Terminal,
    fileSystem: IExtendedFileSystem
  ): crypto.Hash {
    interface IMinimalConfig {
      extends?: string;
    }

    terminal.writeVerboseLine(`Examining config file "${configFilePath}"`);

    const rawConfig: string = fileSystem.readFile(configFilePath);
    const parsedConfig: IMinimalConfig = JsonFile.parseString(rawConfig);
    let hash: crypto.Hash;
    if (parsedConfig.extends) {
      const extendsFullPath: string = ResolveUtilities.resolvePackagePath(
        parsedConfig.extends,
        path.dirname(configFilePath)
      );
      hash = Tslint.getConfigHash(extendsFullPath, terminal, fileSystem);
    } else {
      hash = crypto.createHash('sha1').update(rawConfig);
    }

    return hash.update(rawConfig);
  }

  public printVersionHeader(): void {
    this._terminal.writeLine(`Using TSLint version ${this._tslint.Linter.VERSION}`);
  }

  public reportFailures(): void {
    if (this._lintResult.failures?.length) {
      this._terminal.writeWarningLine(
        `Encountered ${this._lintResult.failures.length} TSLint error${
          this._lintResult.failures.length > 1 ? 's' : ''
        }:`
      );
      for (const tslintFailure of this._lintResult.failures) {
        const buildFolderRelativeFilename: string = path.relative(
          this._buildFolderPath,
          tslintFailure.getFileName()
        );
        const { line, character } = tslintFailure.getStartPosition().getLineAndCharacter();
        const severity: string = tslintFailure.getRuleSeverity().toUpperCase();
        this._terminal.writeWarningLine(
          '  ',
          Colors.yellow(`${severity}: ${buildFolderRelativeFilename}:${line + 1}:${character + 1}`),
          ' - ',
          Colors.yellow(`(${tslintFailure.getRuleName()}) ${tslintFailure.getFailure()}`)
        );
      }
    }
  }

  protected get cacheVersion(): string {
    const tslintConfigHash: crypto.Hash = Tslint.getConfigHash(
      this._linterConfigFilePath,
      this._terminal,
      this._fileSystem
    );
    const tslintConfigVersion: string = `${this._tslint.Linter.VERSION}_${tslintConfigHash.digest('hex')}`;

    return tslintConfigVersion;
  }

  protected async initializeAsync(tsProgram: IExtendedProgram): Promise<void> {
    this._tslintConfiguration = this._tslint.Configuration.loadConfigurationFromPath(
      this._linterConfigFilePath
    );
    this._linter = (new this._tslint.Linter(
      {
        fix: false,
        rulesDirectory: this._tslintConfiguration.rulesDirectory
      },
      tsProgram
    ) as unknown) as IExtendedLinter;

    this._enabledRules = this._linter.getEnabledRules(this._tslintConfiguration, false);

    this._ruleSeverityMap = new Map<string, TTslint.RuleSeverity>(
      this._enabledRules.map((rule): [string, TTslint.RuleSeverity] => [
        rule.getOptions().ruleName,
        rule.getOptions().ruleSeverity
      ])
    );
  }

  protected lintFile(sourceFile: IExtendedSourceFile): TTslint.RuleFailure[] {
    // Some of this code comes from here:
    // https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L161-L179
    // Modified to only lint files that have changed and that we care about
    const failures: TTslint.RuleFailure[] = this._linter.getAllFailures(sourceFile, this._enabledRules);

    for (const failure of failures) {
      const severity: TTslint.RuleSeverity | undefined = this._ruleSeverityMap.get(failure.getRuleName());
      if (severity === undefined) {
        throw new Error(`Severity for rule '${failure.getRuleName()}' not found`);
      }

      failure.setRuleSeverity(severity);
    }

    return failures;
  }

  protected lintingFinished(failures: TTslint.RuleFailure[]): void {
    this._linter.failures = failures;
    this._lintResult = this._linter.getResult();
  }

  protected async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return this._tslint.Configuration.isFileExcluded(filePath, this._tslintConfiguration);
  }
}
