// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import type * as TTslint from 'tslint';
import type * as TTypescript from 'typescript';
import { Import, JsonFile, FileError, FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { LinterBase, type ILinterBaseOptions } from './LinterBase';
import type { IExtendedLinter } from './internalTypings/TslintInternals';

interface ITslintOptions extends ILinterBaseOptions {
  tslintPackagePath: string;
}

export class Tslint extends LinterBase<TTslint.RuleFailure> {
  private _tslint: typeof TTslint;
  private _tslintConfiguration!: TTslint.Configuration.IConfigurationFile;
  private _linter!: IExtendedLinter;
  private _enabledRules!: TTslint.IRule[];
  private _ruleSeverityMap!: Map<string, TTslint.RuleSeverity>;

  public constructor(options: ITslintOptions) {
    super('tslint', options);
    this._tslint = require(options.tslintPackagePath);
  }

  /**
   * Returns the sha1 hash of the contents of the config file at the provided path and the
   * the configs files that the referenced file extends.
   *
   * @param previousHash - If supplied, the hash is updated with the contents of the
   * file's extended configs and itself before being returned. Passing a digested hash to
   * this parameter will result in an error.
   */
  public static async getConfigHashAsync(
    configFilePath: string,
    terminal: ITerminal,
    previousHash?: crypto.Hash
  ): Promise<crypto.Hash> {
    interface IMinimalConfig {
      extends?: string | string[];
    }

    terminal.writeVerboseLine(`Examining config file "${configFilePath}"`);
    // if configFilePath is not a json file, assume that it is a package whose package.json
    // specifies a "main" file which is a config file, per the "extends" spec of tslint.json, found at
    //  https://palantir.github.io/tslint/usage/configuration/
    if (!configFilePath.endsWith('.json')) {
      configFilePath = Import.resolveModule({
        modulePath: configFilePath,
        baseFolderPath: path.dirname(configFilePath)
      });
    }
    const rawConfig: string = await FileSystem.readFileAsync(configFilePath);
    const parsedConfig: IMinimalConfig = JsonFile.parseString(rawConfig);
    const extendsProperty: string | string[] | undefined = parsedConfig.extends;
    let hash: crypto.Hash = previousHash || crypto.createHash('sha1');

    if (extendsProperty instanceof Array) {
      for (const extendFile of extendsProperty) {
        const extendFilePath: string = Import.resolveModule({
          modulePath: extendFile,
          baseFolderPath: path.dirname(configFilePath)
        });
        hash = await Tslint.getConfigHashAsync(extendFilePath, terminal, hash);
      }
    } else if (extendsProperty) {
      // note that if we get here, extendsProperty is a string
      const extendsFullPath: string = Import.resolveModule({
        modulePath: extendsProperty,
        baseFolderPath: path.dirname(configFilePath)
      });
      hash = await Tslint.getConfigHashAsync(extendsFullPath, terminal, hash);
    }

    return hash.update(rawConfig);
  }

  public printVersionHeader(): void {
    this._terminal.writeLine(`Using TSLint version ${this._tslint.Linter.VERSION}`);
  }

  protected async getCacheVersionAsync(): Promise<string> {
    const tslintConfigHash: crypto.Hash = await Tslint.getConfigHashAsync(
      this._linterConfigFilePath,
      this._terminal
    );
    const tslintConfigVersion: string = `${this._tslint.Linter.VERSION}_${tslintConfigHash.digest('hex')}`;

    return tslintConfigVersion;
  }

  protected async initializeAsync(tsProgram: TTypescript.Program): Promise<void> {
    this._tslintConfiguration = this._tslint.Configuration.loadConfigurationFromPath(
      this._linterConfigFilePath
    );
    this._linter = new this._tslint.Linter(
      {
        fix: false,
        rulesDirectory: this._tslintConfiguration.rulesDirectory
      },
      tsProgram
    ) as unknown as IExtendedLinter;

    this._enabledRules = this._linter.getEnabledRules(this._tslintConfiguration, false);

    this._ruleSeverityMap = new Map<string, TTslint.RuleSeverity>(
      this._enabledRules.map((rule): [string, TTslint.RuleSeverity] => [
        rule.getOptions().ruleName,
        rule.getOptions().ruleSeverity
      ])
    );
  }

  protected async lintFileAsync(sourceFile: TTypescript.SourceFile): Promise<TTslint.RuleFailure[]> {
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
    const lintResult: TTslint.LintResult = this._linter.getResult();

    // Report linter errors and warnings to the logger
    if (lintResult.failures.length) {
      for (const tslintFailure of lintResult.failures) {
        const { line, character } = tslintFailure.getStartPosition().getLineAndCharacter();
        const formattedFailure: string = `(${tslintFailure.getRuleName()}) ${tslintFailure.getFailure()}`;
        const errorObject: FileError = new FileError(formattedFailure, {
          absolutePath: tslintFailure.getFileName(),
          projectFolder: this._buildFolderPath,
          line: line + 1,
          column: character + 1
        });
        switch (tslintFailure.getRuleSeverity()) {
          case 'error': {
            this._scopedLogger.emitError(errorObject);
            break;
          }

          case 'warning': {
            this._scopedLogger.emitWarning(errorObject);
            break;
          }
        }
      }
    }
  }

  protected async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return this._tslint.Configuration.isFileExcluded(filePath, this._tslintConfiguration);
  }
}
