// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { createHash, type Hash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type * as TEslint from 'eslint';
import type * as TEslintLegacy from 'eslint-8';
import * as semver from 'semver';
import stableStringify from 'json-stable-stringify-without-jsonify';

import { Async, FileError, FileSystem, Path } from '@rushstack/node-core-library';
import type { HeftConfiguration } from '@rushstack/heft';

import { LinterBase, type ISourceFileToLint, type ILinterBaseOptions } from './LinterBase';
import type { IExtendedSourceFile } from './internalTypings/TypeScriptInternals';
import { name as pluginName, version as pluginVersion } from '../package.json';

interface IEslintInitializeOptions extends ILinterBaseOptions {
  /**
   * Whether this instance should enumerate and lint files selected by the ESLint configuration that are not
   * part of the TypeScript program. Only one instance should do so per lint run (to avoid linting those files
   * more than once when there are multiple TypeScript programs).
   */
  includeAdditionalFiles?: boolean;
}

interface IEslintOptions extends IEslintInitializeOptions {
  eslintPackage: typeof TEslint | typeof TEslintLegacy;
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

function getFormattedErrorMessage(
  lintMessage: TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage
): string {
  // https://eslint.org/docs/developer-guide/nodejs-api#◆-lintmessage-type
  return lintMessage.ruleId ? `(${lintMessage.ruleId}) ${lintMessage.message}` : lintMessage.message;
}

function parserOptionsToJson(this: TEslint.Linter.LanguageOptions['parserOptions']): object {
  const serializableParserOptions: TEslint.Linter.LanguageOptions['parserOptions'] = {
    ...this,
    // Remove the programs to avoid circular references and non-serializable data
    programs: undefined
  };
  return serializableParserOptions;
}

const ESLINT_CONFIG_JS_FILENAME: string = 'eslint.config.js';
const ESLINT_CONFIG_CJS_FILENAME: string = 'eslint.config.cjs';
const ESLINT_CONFIG_MJS_FILENAME: string = 'eslint.config.mjs';
const LEGACY_ESLINTRC_JS_FILENAME: string = '.eslintrc.js';
const LEGACY_ESLINTRC_CJS_FILENAME: string = '.eslintrc.cjs';

const ESLINT_LEGACY_CONFIG_FILENAMES: Set<string> = new Set([
  LEGACY_ESLINTRC_JS_FILENAME,
  LEGACY_ESLINTRC_CJS_FILENAME
]);

// Limits the number of additional files that are read from disk concurrently while enumerating the files to
// lint that are not part of the TypeScript program.
const MAX_ADDITIONAL_FILE_READ_CONCURRENCY: number = 10;

// ESLint's flat config lints these JavaScript extensions by default, so `lintFiles('.')` would otherwise return
// emitted build output (for example the `lib-commonjs`/`lib-esm` folders). They are excluded from the
// additional-file pass so that generated JavaScript is not linted. Note that emit folders such as `lib-esm`
// cannot be identified from the TypeScript compiler options (they come from additionalModuleKindsToEmit), so an
// extension-based filter is used rather than an output-folder filter.
const ESLINT_DEFAULT_EXTENSIONS: Set<string> = new Set(['.js', '.mjs', '.cjs']);

export class Eslint extends LinterBase<TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult> {
  readonly #eslintPackage: typeof TEslint | typeof TEslintLegacy;
  readonly #eslintPackageVersion: semver.SemVer;
  readonly #linter: TEslint.ESLint | TEslintLegacy.ESLint;
  readonly #eslintTimings: Map<string, number> = new Map();
  readonly #currentFixMessages: (TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage)[] = [];
  readonly #fixMessagesByResult: Map<
    TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult,
    (TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage)[]
  > = new Map();
  readonly #sarifLogPath: string | undefined;
  readonly #configHashMap: WeakMap<object, string> = new WeakMap();
  readonly #fileEnumerator: TEslint.ESLint | undefined;
  readonly #typeScriptFilenames: ReadonlySet<string>;
  readonly #includeAdditionalFiles: boolean;

  protected constructor(options: IEslintOptions) {
    super('eslint', options);

    const {
      buildFolderPath,
      eslintPackage,
      linterConfigFilePath,
      tsProgram,
      eslintTimings,
      fix,
      sarifLogPath,
      includeAdditionalFiles
    } = options;
    this.#eslintPackage = eslintPackage;
    this.#includeAdditionalFiles = includeAdditionalFiles ?? false;
    this.#eslintPackageVersion = new semver.SemVer(eslintPackage.ESLint.version);
    const linterConfigFileName: string = path.basename(linterConfigFilePath);
    if (this.#eslintPackageVersion.major < 9 && !ESLINT_LEGACY_CONFIG_FILENAMES.has(linterConfigFileName)) {
      throw new Error(
        `You must use a ${LEGACY_ESLINTRC_JS_FILENAME} or a ${LEGACY_ESLINTRC_CJS_FILENAME} file with ESLint ` +
          `8 or older. The provided config file is "${linterConfigFilePath}".`
      );
    } else if (
      this.#eslintPackageVersion.major >= 9 &&
      ESLINT_LEGACY_CONFIG_FILENAMES.has(linterConfigFileName)
    ) {
      throw new Error(
        `You must use an ${ESLINT_CONFIG_JS_FILENAME}, ${ESLINT_CONFIG_CJS_FILENAME}, or an ` +
          `${ESLINT_CONFIG_MJS_FILENAME} file with ESLint 9 or newer. The provided config file is ` +
          `"${linterConfigFilePath}".`
      );
    }

    this.#sarifLogPath = sarifLogPath;

    this.#typeScriptFilenames = new Set(
      tsProgram.getRootFileNames().map((filePath: string) => path.resolve(buildFolderPath, filePath))
    );
    // ESLint configuration paths are relative to the project folder. Compute the project-relative paths of the
    // files in the TypeScript program so that the injected program can be scoped to just those files, and so
    // that those files can be excluded when enumerating the additional files to lint. Only files under the
    // project folder can be expressed as ESLint configuration patterns.
    const typeScriptFilePatterns: string[] = [];
    for (const filePath of this.#typeScriptFilenames) {
      if (Path.isUnder(filePath, buildFolderPath)) {
        // filePath is already an absolute path under buildFolderPath, so strip the prefix (plus the separator)
        // instead of recomputing the relative path.
        typeScriptFilePatterns.push(Path.convertToSlashes(filePath.slice(buildFolderPath.length + 1)));
      }
    }

    let overrideConfig: TEslint.Linter.Config | TEslintLegacy.Linter.Config | undefined;
    let fixFn: Exclude<TEslint.ESLint.Options['fix'] | TEslintLegacy.ESLint.Options['fix'], boolean>;
    if (fix) {
      // We do not receive the messages for the issues that were fixed, so we need to track them ourselves
      // so that we can log them after the fix is applied. This array will be populated by the fix function,
      // and subsequently mapped to the results in the ESLint.lintFileAsync method below. After the messages
      // are mapped, the array will be cleared so that it is ready for the next fix operation.
      fixFn = (message: TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage) => {
        this.#currentFixMessages.push(message);
        return true;
      };
    } else if (this.#eslintPackageVersion.major <= 8) {
      // The @typescript-eslint/parser package allows providing an existing TypeScript program to avoid needing
      // to reparse. However, fixers in ESLint run in multiple passes against the underlying code until the
      // fix fully succeeds. This conflicts with providing an existing program as the code no longer maps to
      // the provided program, producing garbage fix output. To avoid this, only provide the existing program
      // if we're not fixing.
      const legacyEslintOverrideConfig: TEslintLegacy.Linter.Config = {
        parserOptions: {
          programs: [tsProgram],
          toJSON: parserOptionsToJson
        }
      };
      overrideConfig = legacyEslintOverrideConfig;
    } else {
      let overrideParserOptions: TEslint.Linter.ParserOptions = {
        programs: [tsProgram],
        // Used by stableStringify and ESLint > 9.28.0
        toJSON: parserOptionsToJson,
        // ESlint's merge logic for parserOptions is a "replace", so we need to set this again
        tsconfigRootDir: buildFolderPath
      };
      if (this.#eslintPackageVersion.minor < 28) {
        overrideParserOptions = Object.defineProperties(overrideParserOptions, {
          // Support for `toJSON` within languageOptions was added in ESLint 9.28.0
          // This hack tells ESLint's `languageOptionsToJSON` function to replace the entire `parserOptions` object with `@rushstack/heft-lint-plugin@${version}`
          meta: {
            value: {
              name: pluginName,
              version: pluginVersion
            }
          }
        });
      }
      // The @typescript-eslint/parser package allows providing an existing TypeScript program to avoid needing
      // to reparse. However, fixers in ESLint run in multiple passes against the underlying code until the
      // fix fully succeeds. This conflicts with providing an existing program as the code no longer maps to
      // the provided program, producing garbage fix output. To avoid this, only provide the existing program
      // if we're not fixing.
      // Scope the injected TypeScript program to the files that the program actually contains. Files that are
      // selected by the ESLint configuration but excluded from the program (for example config files or tests
      // outside the tsconfig) will fall through to the ESLint configuration's own parser instead of failing to
      // resolve against the program.
      const eslintOverrideConfig: TEslint.Linter.Config = {
        files: typeScriptFilePatterns,
        languageOptions: {
          parserOptions: overrideParserOptions
        }
      };
      overrideConfig = eslintOverrideConfig;
    }

    this.#linter = new eslintPackage.ESLint({
      cwd: buildFolderPath,
      overrideConfigFile: linterConfigFilePath,
      // Override config takes precedence over overrideConfigFile
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overrideConfig: overrideConfig as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fix: fixFn as any
    });
    if (this.#eslintPackageVersion.major >= 9) {
      const flatEslintPackage: typeof TEslint = eslintPackage as typeof TEslint;
      // A separate instance is used purely to enumerate the files selected by the ESLint configuration that are
      // not part of the TypeScript program. Rules are disabled so that this pass only resolves the file list.
      this.#fileEnumerator = new flatEslintPackage.ESLint({
        cwd: buildFolderPath,
        errorOnUnmatchedPattern: false,
        overrideConfigFile: linterConfigFilePath,
        overrideConfig: {
          // This is the label for the flat-config object (used in ESLint debug output/config inspection); it is
          // not a plugin reference. It ignores the TypeScript program files so enumeration returns only the
          // files that are not part of the program.
          name: `${pluginName}/ignore-typescript-program-files`,
          ignores: typeScriptFilePatterns
        },
        ruleFilter: () => false
      });
    }

    this.#eslintTimings = eslintTimings;
  }

  public static async resolveEslintConfigFilePathAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<string | undefined> {
    // When project is configured with "type": "module" in package.json, the config file must have a .cjs extension
    // so use it if it exists
    const configPathCandidates: string[] = [
      `${heftConfiguration.buildFolderPath}/${ESLINT_CONFIG_JS_FILENAME}`,
      `${heftConfiguration.buildFolderPath}/${ESLINT_CONFIG_CJS_FILENAME}`,
      `${heftConfiguration.buildFolderPath}/${ESLINT_CONFIG_MJS_FILENAME}`,
      `${heftConfiguration.buildFolderPath}/${LEGACY_ESLINTRC_JS_FILENAME}`,
      `${heftConfiguration.buildFolderPath}/${LEGACY_ESLINTRC_CJS_FILENAME}`
    ];
    const foundConfigs: string[] = (
      await Promise.all(configPathCandidates.map(async (p: string) => (await FileSystem.existsAsync(p)) && p))
    ).filter((p) => p !== false);

    if (foundConfigs.length > 1) {
      throw new Error(`Project contains multiple ESLint configuration files: "${foundConfigs.join('", "')}"`);
    }

    return foundConfigs[0];
  }

  public static async initializeAsync(options: IEslintInitializeOptions): Promise<Eslint> {
    const { linterToolPath, includeAdditionalFiles } = options;
    const eslintTimings: Map<string, number> = new Map();
    // This must happen before the rest of the linter package is loaded
    await patchTimerAsync(linterToolPath, eslintTimings);

    const eslintPackage: typeof TEslint = await import(linterToolPath);
    return new Eslint({
      ...options,
      eslintPackage,
      eslintTimings,
      includeAdditionalFiles
    });
  }

  public override printVersionHeader(): void {
    const { version, major } = this.#eslintPackageVersion;
    this._terminal.writeLine(`Using ESLint version ${version}`);

    if (major < 7) {
      throw new Error('Heft requires ESLint 7 or newer.  Your ESLint version is too old');
    } else if (major > 9) {
      // We don't use writeWarningLine() here because, if the person wants to take their chances with
      // a newer ESLint release, their build should be allowed to succeed.
      this._terminal.writeLine(
        'The ESLint version is newer than the latest version that was tested with Heft, so it may not work correctly.'
      );
    }
  }

  protected override async getExtraSourceFilesToLintAsync(
    typeScriptFilenames: ReadonlySet<string>
  ): Promise<Iterable<ISourceFileToLint>> {
    if (!this.#includeAdditionalFiles || !this.#fileEnumerator) {
      return [];
    }

    // The enumerator ESLint instance is constructed with `cwd: buildFolderPath`, so linting `'.'` resolves
    // against the project folder (not the process working directory).
    const lintResults: TEslint.ESLint.LintResult[] = await this.#fileEnumerator.lintFiles(['.']);

    // ESLint reports absolute file paths, so they can be compared directly against the TypeScript program's
    // (already resolved) file paths. Files that are part of the program are excluded, as are ESLint's default
    // JavaScript extensions (see ESLINT_DEFAULT_EXTENSIONS); everything else the ESLint configuration selects
    // (and does not ignore) is linted as an additional file.
    const additionalFilePaths: string[] = [];
    for (const { filePath } of lintResults) {
      if (!typeScriptFilenames.has(filePath) && !ESLINT_DEFAULT_EXTENSIONS.has(path.extname(filePath))) {
        additionalFilePaths.push(filePath);
      }
    }
    // Sort for a stable ordering across runs. ESLint reports absolute paths, so a default lexicographic sort
    // is sufficient.
    additionalFilePaths.sort();

    const additionalLintFiles: ISourceFileToLint[] = new Array(additionalFilePaths.length);
    await Async.forEachAsync(
      additionalFilePaths,
      async (filePath: string, index: number) => {
        additionalLintFiles[index] = {
          fileName: filePath,
          // `version` is intentionally omitted so that LinterBase computes it from the file contents. Unlike
          // TypeScript source files, these files have no precomputed version from the incremental program.
          text: await FileSystem.readFileAsync(filePath)
        };
      },
      { concurrency: MAX_ADDITIONAL_FILE_READ_CONCURRENCY }
    );

    return additionalLintFiles;
  }

  protected override async getCacheVersionAsync(): Promise<string> {
    return `${this.#eslintPackageVersion.version}_${process.version}`;
  }

  protected override async getSourceFileHashAsync(
    sourceFile: IExtendedSourceFile | ISourceFileToLint
  ): Promise<string> {
    const sourceFileEslintConfiguration: TEslint.Linter.Config = await this.#linter.calculateConfigForFile(
      sourceFile.fileName
    );

    const hash: Hash = createHash('sha1');
    // Use a stable stringifier to ensure that the hash is always the same, even if the order of the properties
    // changes. This is also done in ESLint
    // https://github.com/eslint/eslint/blob/8bbabc4691d97733a422180c71eba6c097b35475/lib/cli-engine/lint-result-cache.js#L50
    hash.update(stableStringify(sourceFileEslintConfiguration));

    // Since the original hash can either come from TypeScript or from manually hashing the file, we can just
    // append the config hash to the original hash to avoid reducing the hash space
    const originalSourceFileHash: string = await super.getSourceFileHashAsync(sourceFile);
    return `${originalSourceFileHash}_${hash.digest('base64')}`;
  }

  protected override async lintFileAsync(
    sourceFile: IExtendedSourceFile | ISourceFileToLint
  ): Promise<TEslint.ESLint.LintResult[] | TEslintLegacy.ESLint.LintResult[]> {
    const lintResults: TEslint.ESLint.LintResult[] | TEslintLegacy.ESLint.LintResult[] =
      await this.#linter.lintText(sourceFile.text, { filePath: sourceFile.fileName });

    // Map the fix messages to the results. This API should only return one result per file, so we can be sure
    // that the fix messages belong to the returned result. If we somehow receive multiple results, we will
    // drop the messages on the floor, but since they are only used for logging, this should not be a problem.
    const fixMessages: (TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage)[] =
      this.#currentFixMessages.splice(0);
    if (lintResults.length === 1) {
      this.#fixMessagesByResult.set(lintResults[0], fixMessages);
    }

    this._fixesPossible ||=
      !this._fix &&
      lintResults.some((lintResult: TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult) => {
        return lintResult.fixableErrorCount + lintResult.fixableWarningCount > 0;
      });

    return lintResults;
  }

  protected override async lintingFinishedAsync(lintResults: TEslint.ESLint.LintResult[]): Promise<void> {
    let omittedRuleCount: number = 0;
    const timings: [string, number][] = Array.from(this.#eslintTimings).sort(
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

    if (this._fix && this.#fixMessagesByResult.size > 0) {
      await this.#eslintPackage.ESLint.outputFixes(lintResults);
    }

    for (const lintResult of lintResults) {
      // Report linter fixes to the logger. These will only be returned when the underlying failure was fixed
      const fixMessages: TEslint.Linter.LintMessage[] | TEslintLegacy.Linter.LintMessage[] | undefined =
        this.#fixMessagesByResult.get(lintResult);
      if (fixMessages) {
        for (const fixMessage of fixMessages) {
          const formattedMessage: string = `[FIXED] ${getFormattedErrorMessage(fixMessage)}`;
          const errorObject: FileError = this.#getLintFileError(lintResult, fixMessage, formattedMessage);
          this._scopedLogger.emitWarning(errorObject);
        }
      }

      // Report linter errors and warnings to the logger
      for (const lintMessage of lintResult.messages) {
        const additionalFileTypeInformationError: string | undefined = getAdditionalFileTypeInformationError(
          this.#typeScriptFilenames,
          this._buildFolderPath,
          lintResult,
          lintMessage
        );
        const errorObject: FileError = this.#getLintFileError(
          lintResult,
          lintMessage,
          additionalFileTypeInformationError
        );
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

    const sarifLogPath: string | undefined = this.#sarifLogPath;
    if (sarifLogPath) {
      const rulesMeta: TEslint.ESLint.LintResultData['rulesMeta'] =
        this.#linter.getRulesMetaForResults(lintResults);
      const { formatEslintResultsAsSARIF } = await import('./SarifFormatter');
      const sarifString: string = JSON.stringify(
        formatEslintResultsAsSARIF(lintResults, rulesMeta, {
          ignoreSuppressed: false,
          eslintVersion: this.#eslintPackage.ESLint.version,
          buildFolderPath: this._buildFolderPath
        }),
        undefined,
        2
      );

      await FileSystem.writeFileAsync(sarifLogPath, sarifString, { ensureFolderExists: true });
    }
  }

  protected override async isFileExcludedAsync(filePath: string): Promise<boolean> {
    return await this.#linter.isPathIgnored(filePath);
  }

  protected override hasLintFailures(
    lintResults: (TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult)[]
  ): boolean {
    return lintResults.some((lintResult: TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult) => {
      return (
        !lintResult.suppressedMessages?.length && (lintResult.errorCount > 0 || lintResult.warningCount > 0)
      );
    });
  }

  #getLintFileError(
    lintResult: TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult,
    lintMessage: TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage,
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

function getAdditionalFileTypeInformationError(
  typeScriptFilenames: ReadonlySet<string>,
  buildFolderPath: string,
  lintResult: TEslint.ESLint.LintResult | TEslintLegacy.ESLint.LintResult,
  lintMessage: TEslint.Linter.LintMessage | TEslintLegacy.Linter.LintMessage
): string | undefined {
  // ESLint reports a fatal parsing error when a type-aware rule is applied to a file that is not part of any
  // TypeScript program or project. Files that are selected by the ESLint configuration but excluded from the
  // TypeScript program hit this case, so surface actionable guidance instead of the raw parser error. Files
  // that are part of the program (or non-fatal messages) are reported normally.
  if (!lintMessage.fatal || typeScriptFilenames.has(lintResult.filePath)) {
    return undefined;
  }

  const { message } = lintMessage;
  const indicatesMissingTypeInformation: boolean =
    message.includes('parserOptions.project') ||
    message.includes('projectService') ||
    message.includes('program instance') ||
    message.includes('does not include this file') ||
    message.includes('not found by the project service');
  if (!indicatesMissingTypeInformation) {
    return undefined;
  }

  const relativePath: string = Path.convertToSlashes(path.relative(buildFolderPath, lintResult.filePath));
  return (
    `The ESLint configuration selected "${relativePath}", which is not part of the TypeScript program, so ` +
    'type-aware rules cannot run on it. Either exclude this file from ESLint by adding it to the "ignores" ' +
    'of your ESLint configuration, or lint it with a configuration that does not enable type-aware rules. ' +
    `(ESLint reported: ${message})`
  );
}
