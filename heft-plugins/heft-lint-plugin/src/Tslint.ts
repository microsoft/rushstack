// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type * as TTslint from 'tslint';
import type * as TTypescript from 'typescript';
import { Import, JsonFile, FileError, FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { HeftConfiguration } from '@rushstack/heft';

import { LinterBase, type ILinterBaseOptions } from './LinterBase';
import type { IExtendedLinter } from './internalTypings/TslintInternals';

interface ITslintOptions extends ILinterBaseOptions {
  tslintPackage: typeof TTslint;
  tslintConfiguration: TTslint.Configuration.IConfigurationFile;
}

function getFormattedErrorMessage(tslintFailure: TTslint.RuleFailure): string {
  return `(${tslintFailure.getRuleName()}) ${tslintFailure.getFailure()}`;
}

const TSLINT_CONFIG_FILE_NAME: string = 'tslint.json';

export class Tslint extends LinterBase<TTslint.RuleFailure> {
  private readonly _tslintPackage: typeof TTslint;
  private readonly _tslintConfiguration: TTslint.Configuration.IConfigurationFile;
  private readonly _linter: IExtendedLinter;
  private readonly _enabledRules: TTslint.IRule[];
  private readonly _ruleSeverityMap: Map<string, TTslint.RuleSeverity>;

  public constructor(options: ITslintOptions) {
    super('tslint', options);

    const { tslintPackage, tsProgram } = options;
    this._tslintPackage = tslintPackage;
    this._tslintConfiguration = options.tslintConfiguration;
    this._linter = new tslintPackage.Linter(
      {
        // This is not handled by the linter in the way that we use it, so we will manually apply
        // fixes later
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

  public static async initializeAsync(options: ILinterBaseOptions): Promise<Tslint> {
    const { linterToolPath, linterConfigFilePath } = options;
    const tslintPackage: typeof TTslint = await import(linterToolPath);
    const tslintConfiguration: TTslint.Configuration.IConfigurationFile =
      tslintPackage.Configuration.loadConfigurationFromPath(linterConfigFilePath);
    return new Tslint({
      ...options,
      tslintPackage,
      tslintConfiguration
    });
  }

  public static async resolveTslintConfigFilePathAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<string | undefined> {
    const tslintConfigFilePath: string = `${heftConfiguration.buildFolderPath}/${TSLINT_CONFIG_FILE_NAME}`;
    const tslintConfigFileExists: boolean = await FileSystem.existsAsync(tslintConfigFilePath);
    return tslintConfigFileExists ? tslintConfigFilePath : undefined;
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
    this._terminal.writeLine(`Using TSLint version ${this._tslintPackage.Linter.VERSION}`);
  }

  protected async getCacheVersionAsync(): Promise<string> {
    const tslintConfigHash: crypto.Hash = await Tslint.getConfigHashAsync(
      this._linterConfigFilePath,
      this._terminal
    );
    const tslintConfigVersion: string = `${this._tslintPackage.Linter.VERSION}_${tslintConfigHash.digest(
      'hex'
    )}`;

    return tslintConfigVersion;
  }

  protected async lintFileAsync(sourceFile: TTypescript.SourceFile): Promise<TTslint.RuleFailure[]> {
    // Some of this code comes from here:
    // https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L161-L179
    // Modified to only lint files that have changed and that we care about
    let failures: TTslint.RuleFailure[] = this._linter.getAllFailures(sourceFile, this._enabledRules);
    const hasFixableIssue: boolean = failures.some((f) => f.hasFix());
    if (hasFixableIssue) {
      if (this._fix) {
        failures = this._linter.applyAllFixes(this._enabledRules, failures, sourceFile, sourceFile.fileName);
      } else {
        this._fixesPossible = true;
      }
    }

    for (const failure of failures) {
      const severity: TTslint.RuleSeverity | undefined = this._ruleSeverityMap.get(failure.getRuleName());
      if (severity === undefined) {
        throw new Error(`Severity for rule '${failure.getRuleName()}' not found`);
      }

      failure.setRuleSeverity(severity);
    }

    return failures;
  }

  protected async lintingFinishedAsync(failures: TTslint.RuleFailure[]): Promise<void> {
    this._linter.failures = failures;
    const lintResult: TTslint.LintResult = this._linter.getResult();

    // Report linter fixes to the logger. These will only be returned when the underlying failure was fixed
    if (lintResult.fixes?.length) {
      for (const fixedTslintFailure of lintResult.fixes) {
        const formattedMessage: string = `[FIXED] ${getFormattedErrorMessage(fixedTslintFailure)}`;
        const errorObject: FileError = this._getLintFileError(fixedTslintFailure, formattedMessage);
        this._scopedLogger.emitWarning(errorObject);
      }
    }

    // Report linter errors and warnings to the logger
    for (const tslintFailure of lintResult.failures) {
      const errorObject: FileError = this._getLintFileError(tslintFailure);
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

  protected async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return this._tslintPackage.Configuration.isFileExcluded(filePath, this._tslintConfiguration);
  }

  private _getLintFileError(tslintFailure: TTslint.RuleFailure, message?: string): FileError {
    if (!message) {
      message = getFormattedErrorMessage(tslintFailure);
    }

    const { line, character } = tslintFailure.getStartPosition().getLineAndCharacter();
    return new FileError(message, {
      absolutePath: tslintFailure.getFileName(),
      projectFolder: this._buildFolderPath,
      line: line + 1,
      column: character + 1
    });
  }
}
