// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import * as path from 'path';
import { Worker } from 'worker_threads';

import * as semver from 'semver';
import type * as TTypescript from 'typescript';
import { JsonFile, type IPackageJson, Path, FileError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { IScopedLogger } from '@rushstack/heft';

import type { ExtendedTypeScript, IExtendedSolutionBuilder } from './internalTypings/TypeScriptInternals';
import type { ITypeScriptConfigurationJson } from './TypeScriptPlugin';
import type { PerformanceMeasurer } from './Performance';
import type {
  ICachedEmitModuleKind,
  ITranspilationRequestMessage,
  ITranspilationResponseMessage,
  ITypescriptWorkerData
} from './types';
import { configureProgramForMultiEmit } from './configureProgramForMultiEmit';

export interface ITypeScriptBuilderConfiguration extends ITypeScriptConfigurationJson {
  /**
   * The root folder of the build.
   */
  buildFolderPath: string;

  /**
   * The folder to write build metadata.
   */
  buildMetadataFolderPath: string;

  /**
   * The path to the TypeScript tool.
   */
  typeScriptToolPath: string;

  // watchMode: boolean;

  /**
   * The path to the tsconfig file being built.
   */
  tsconfigPath: string;

  /**
   * The scoped logger that the builder will log to.
   */
  scopedLogger: IScopedLogger;

  /**
   * The callback used to emit the typescript program (or programs) from the builder.
   */
  emitChangedFilesCallback: (
    program: TTypescript.Program,
    changedFiles?: Set<TTypescript.SourceFile>
  ) => void;
}

type TSolutionHost = TTypescript.SolutionBuilderHost<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram>;
type TWatchCompilerHost =
  TTypescript.WatchCompilerHostOfFilesAndCompilerOptions<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram>;
type TWatchSolutionHost =
  TTypescript.SolutionBuilderWithWatchHost<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram>;
type TWatchProgram =
  TTypescript.WatchOfFilesAndCompilerOptions<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram>;

interface ICompilerCapabilities {
  /**
   * Support for incremental compilation via `ts.createIncrementalProgram()`.
   * Introduced with TypeScript 3.6.
   */
  incrementalProgram: boolean;

  /**
   * Support for composite projects via `ts.createSolutionBuilder()`.
   * Introduced with TypeScript 3.0.
   */
  solutionBuilder: boolean;
}

interface IFileToWrite {
  filePath: string;
  data: string;
}

interface IModuleKindReason {
  kind: keyof typeof TTypescript.ModuleKind;
  outDir: string;
  extension: '.js' | '.cjs' | '.mjs';
  reason: string;
}

interface IExtendedEmitResult extends TTypescript.EmitResult {
  changedSourceFiles: Set<TTypescript.SourceFile>;
  filesToWrite: IFileToWrite[];
}

interface IPendingWork {
  (): void;
}

interface ITranspileSignal {
  resolve: (result: TTypescript.EmitResult) => void;
  reject: (error: Error) => void;
}

const OLDEST_SUPPORTED_TS_MAJOR_VERSION: number = 2;
const OLDEST_SUPPORTED_TS_MINOR_VERSION: number = 9;

const NEWEST_SUPPORTED_TS_MAJOR_VERSION: number = 5;
const NEWEST_SUPPORTED_TS_MINOR_VERSION: number = 4;

interface ITypeScriptTool {
  ts: ExtendedTypeScript;
  system: TTypescript.System;
  measureSync: PerformanceMeasurer;

  sourceFileCache: Map<string, TTypescript.SourceFile>;

  watchProgram: TWatchProgram | undefined;

  solutionBuilder: IExtendedSolutionBuilder | undefined;

  rawDiagnostics: TTypescript.Diagnostic[];
  pendingOperations: Set<IPendingWork>;

  executing: boolean;

  worker: Worker | undefined;
  pendingTranspilePromises: Map<number, Promise<TTypescript.EmitResult>>;
  pendingTranspileSignals: Map<number, ITranspileSignal>;

  reportDiagnostic: TTypescript.DiagnosticReporter;
}

export class TypeScriptBuilder {
  private readonly _configuration: ITypeScriptBuilderConfiguration;
  private readonly _typescriptLogger: IScopedLogger;
  private readonly _typescriptTerminal: ITerminal;

  private _typescriptVersion!: string;
  private _typescriptParsedVersion!: semver.SemVer;

  private _capabilities!: ICompilerCapabilities;
  private _useSolutionBuilder!: boolean;

  private _moduleKindsToEmit!: ICachedEmitModuleKind[];
  private readonly _suppressedDiagnosticCodes: Set<number> = new Set();

  private __tsCacheFilePath: string | undefined;

  private _tool: ITypeScriptTool | undefined = undefined;

  private _nextRequestId: number = 0;

  private get _tsCacheFilePath(): string {
    if (!this.__tsCacheFilePath) {
      // TypeScript internally handles if the tsconfig options have changed from when the tsbuildinfo file was created.
      // We only need to hash our additional Heft configuration.
      const configHash: crypto.Hash = crypto.createHash('sha1');

      configHash.update(JSON.stringify(this._configuration.additionalModuleKindsToEmit || {}));
      const serializedConfigHash: string = configHash
        .digest('base64')
        .slice(0, 8)
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // This conversion is theoretically redundant, but it is here to make absolutely sure that the path is formatted
      // using only '/' as the directory separator so that incremental builds don't break on Windows.
      // TypeScript will normalize to '/' when serializing, but not on the direct input, and uses exact string equality.
      const normalizedCacheFolderPath: string = Path.convertToSlashes(
        this._configuration.buildMetadataFolderPath
      );
      this.__tsCacheFilePath = `${normalizedCacheFolderPath}/ts_${serializedConfigHash}.json`;
    }

    return this.__tsCacheFilePath;
  }

  public constructor(configuration: ITypeScriptBuilderConfiguration) {
    this._configuration = configuration;
    this._typescriptLogger = configuration.scopedLogger;
    this._typescriptTerminal = configuration.scopedLogger.terminal;
  }

  public async invokeAsync(onChangeDetected?: () => void): Promise<void> {
    if (!this._tool) {
      // Determine the compiler version
      const compilerPackageJsonFilename: string = path.join(
        this._configuration.typeScriptToolPath,
        'package.json'
      );
      const packageJson: IPackageJson = await JsonFile.loadAsync(compilerPackageJsonFilename);
      this._typescriptVersion = packageJson.version;
      const parsedVersion: semver.SemVer | null = semver.parse(this._typescriptVersion);
      if (!parsedVersion) {
        throw new Error(
          `Unable to parse version "${this._typescriptVersion}" for TypeScript compiler package in: ` +
            compilerPackageJsonFilename
        );
      }
      this._typescriptParsedVersion = parsedVersion;

      // Detect what features this compiler supports.  Note that manually comparing major/minor numbers
      // loosens the matching to accept prereleases such as "3.6.0-dev.20190530"
      this._capabilities = {
        incrementalProgram: false,
        solutionBuilder: this._typescriptParsedVersion.major >= 3
      };

      if (
        this._typescriptParsedVersion.major > 3 ||
        (this._typescriptParsedVersion.major === 3 && this._typescriptParsedVersion.minor >= 6)
      ) {
        this._capabilities.incrementalProgram = true;
      }

      this._useSolutionBuilder = !!this._configuration.buildProjectReferences;
      if (this._useSolutionBuilder && !this._capabilities.solutionBuilder) {
        throw new Error(
          `Building project references requires TypeScript@>=3.0, but the current version is ${this._typescriptVersion}`
        );
      }

      // Report a warning if the TypeScript version is too old/new.  The current oldest supported version is
      // TypeScript 2.9. Prior to that the "ts.getConfigFileParsingDiagnostics()" API is missing; more fixups
      // would be required to deal with that.  We won't do that work unless someone requests it.
      if (
        this._typescriptParsedVersion.major < OLDEST_SUPPORTED_TS_MAJOR_VERSION ||
        (this._typescriptParsedVersion.major === OLDEST_SUPPORTED_TS_MAJOR_VERSION &&
          this._typescriptParsedVersion.minor < OLDEST_SUPPORTED_TS_MINOR_VERSION)
      ) {
        // We don't use writeWarningLine() here because, if the person wants to take their chances with
        // a seemingly unsupported compiler, their build should be allowed to succeed.
        this._typescriptTerminal.writeLine(
          `The TypeScript compiler version ${this._typescriptVersion} is very old` +
            ` and has not been tested with Heft; it may not work correctly.`
        );
      } else if (
        this._typescriptParsedVersion.major > NEWEST_SUPPORTED_TS_MAJOR_VERSION ||
        (this._typescriptParsedVersion.major === NEWEST_SUPPORTED_TS_MAJOR_VERSION &&
          this._typescriptParsedVersion.minor > NEWEST_SUPPORTED_TS_MINOR_VERSION)
      ) {
        this._typescriptTerminal.writeLine(
          `The TypeScript compiler version ${this._typescriptVersion} is newer` +
            ' than the latest version that was tested with Heft ' +
            `(${NEWEST_SUPPORTED_TS_MAJOR_VERSION}.${NEWEST_SUPPORTED_TS_MINOR_VERSION}); it may not work correctly.`
        );
      }

      const ts: ExtendedTypeScript = require(this._configuration.typeScriptToolPath);

      ts.performance.enable();

      const suppressedCodes: (number | undefined)[] = [
        ts.Diagnostics.Property_0_has_no_initializer_and_is_not_definitely_assigned_in_the_constructor?.code,
        // This diagnostic code is not present in old versions of TypeScript
        ts.Diagnostics
          .Element_implicitly_has_an_any_type_because_expression_of_type_0_can_t_be_used_to_index_type_1?.code
      ];
      for (const code of suppressedCodes) {
        if (code !== undefined) {
          this._suppressedDiagnosticCodes.add(code);
        }
      }

      const measureTsPerformance: PerformanceMeasurer = <TResult extends object | void>(
        measurementName: string,
        fn: () => TResult
      ) => {
        const beforeName: string = `before${measurementName}`;
        ts.performance.mark(beforeName);
        const result: TResult = fn();
        const afterName: string = `after${measurementName}`;
        ts.performance.mark(afterName);
        ts.performance.measure(measurementName, beforeName, afterName);
        return {
          ...result,
          duration: ts.performance.getDuration(measurementName),
          count: ts.performance.getCount(beforeName)
        };
      };

      this._typescriptTerminal.writeLine(`Using TypeScript version ${ts.version}`);

      const rawDiagnostics: TTypescript.Diagnostic[] = [];

      const pendingOperations: Set<IPendingWork> = new Set();

      const clearTimeout = (timeout: IPendingWork): void => {
        pendingOperations.delete(timeout);
      };

      const setTimeout = <T extends unknown[]>(
        fn: (...args: T) => void,
        ms: number,
        ...args: T
      ): IPendingWork => {
        const timeout: IPendingWork = () => {
          fn(...args);
        };
        pendingOperations.add(timeout);
        if (!this._tool?.executing && onChangeDetected) {
          onChangeDetected();
        }
        return timeout;
      };

      // Need to also update watchFile and watchDirectory
      const system: TTypescript.System = {
        ...ts.sys,
        getCurrentDirectory: () => this._configuration.buildFolderPath,
        clearTimeout,
        setTimeout
      };

      this._tool = {
        ts,
        system,

        measureSync: measureTsPerformance,

        sourceFileCache: new Map(),

        watchProgram: undefined,
        solutionBuilder: undefined,

        rawDiagnostics,

        pendingOperations,

        executing: false,

        reportDiagnostic: (diagnostic: TTypescript.Diagnostic) => {
          rawDiagnostics.push(diagnostic);
        },

        worker: undefined,

        pendingTranspilePromises: new Map(),
        pendingTranspileSignals: new Map()
      };
    }

    const { performance } = this._tool.ts;
    // Reset the performance counters to 0 to avoid contamination from previous runs
    performance.disable();
    performance.enable();

    if (onChangeDetected !== undefined) {
      await this._runWatchAsync(this._tool);
    } else if (this._useSolutionBuilder) {
      await this._runSolutionBuildAsync(this._tool);
    } else {
      await this._runBuildAsync(this._tool);
    }
  }

  public async _runWatchAsync(tool: ITypeScriptTool): Promise<void> {
    const {
      ts,
      measureSync: measureTsPerformance,
      pendingOperations,
      rawDiagnostics,
      pendingTranspilePromises
    } = tool;

    if (!tool.solutionBuilder && !tool.watchProgram) {
      //#region CONFIGURE
      const { duration: configureDurationMs, tsconfig } = measureTsPerformance('Configure', () => {
        const _tsconfig: TTypescript.ParsedCommandLine = this._loadTsconfig(ts);
        this._validateTsconfig(ts, _tsconfig);

        return {
          tsconfig: _tsconfig
        };
      });
      this._typescriptTerminal.writeVerboseLine(`Configure: ${configureDurationMs}ms`);
      //#endregion

      if (this._useSolutionBuilder) {
        const solutionHost: TWatchSolutionHost = this._buildWatchSolutionBuilderHost(tool);
        const builder: TTypescript.SolutionBuilder<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram> =
          ts.createSolutionBuilderWithWatch(solutionHost, [this._configuration.tsconfigPath], {});

        tool.solutionBuilder = builder as IExtendedSolutionBuilder;

        builder.build();
      } else {
        const compilerHost: TWatchCompilerHost = this._buildWatchCompilerHost(tool, tsconfig);
        tool.watchProgram = ts.createWatchProgram(compilerHost);
      }
    }

    if (pendingOperations.size > 0) {
      rawDiagnostics.length = 0;
      tool.executing = true;
      for (const operation of pendingOperations) {
        pendingOperations.delete(operation);
        operation();
      }
      if (pendingTranspilePromises.size) {
        const emitResults: TTypescript.EmitResult[] = await Promise.all(pendingTranspilePromises.values());
        for (const { diagnostics } of emitResults) {
          for (const diagnostic of diagnostics) {
            rawDiagnostics.push(diagnostic);
          }
        }
      }
      // eslint-disable-next-line require-atomic-updates
      tool.executing = false;
    }
    this._logDiagnostics(ts, rawDiagnostics, this._useSolutionBuilder);
  }

  public async _runBuildAsync(tool: ITypeScriptTool): Promise<void> {
    const { ts, measureSync: measureTsPerformance, pendingTranspilePromises } = tool;

    //#region CONFIGURE
    const {
      duration: configureDurationMs,
      tsconfig,
      compilerHost
    } = measureTsPerformance('Configure', () => {
      const _tsconfig: TTypescript.ParsedCommandLine = this._loadTsconfig(ts);
      this._validateTsconfig(ts, _tsconfig);

      const _compilerHost: TTypescript.CompilerHost = this._buildIncrementalCompilerHost(tool, _tsconfig);

      return {
        tsconfig: _tsconfig,
        compilerHost: _compilerHost
      };
    });
    this._typescriptTerminal.writeVerboseLine(`Configure: ${configureDurationMs}ms`);
    //#endregion

    //#region PROGRAM
    // There will be only one program here; emit will get a bit abused if we produce multiple outputs
    let builderProgram: TTypescript.BuilderProgram | undefined = undefined;
    let innerProgram: TTypescript.Program;

    const isolatedModules: boolean =
      !!this._configuration.useTranspilerWorker && !!tsconfig.options.isolatedModules;
    const mode: 'both' | 'declaration' = isolatedModules ? 'declaration' : 'both';

    let filesToTranspile: Map<string, string> | undefined;

    if (tsconfig.options.incremental) {
      // Use ts.createEmitAndSemanticDiagnositcsBuilderProgram directly because the customizations performed by
      // _getCreateBuilderProgram duplicate those performed in this function for non-incremental build.
      const oldProgram: TTypescript.EmitAndSemanticDiagnosticsBuilderProgram | undefined =
        ts.readBuilderProgram(tsconfig.options, compilerHost);
      builderProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        tsconfig.fileNames,
        tsconfig.options,
        compilerHost,
        oldProgram,
        ts.getConfigFileParsingDiagnostics(tsconfig),
        tsconfig.projectReferences
      );
      filesToTranspile = getFilesToTranspileFromBuilderProgram(builderProgram);
      innerProgram = builderProgram.getProgram();
    } else {
      innerProgram = ts.createProgram({
        rootNames: tsconfig.fileNames,
        options: tsconfig.options,
        projectReferences: tsconfig.projectReferences,
        host: compilerHost,
        oldProgram: undefined,
        configFileParsingDiagnostics: ts.getConfigFileParsingDiagnostics(tsconfig)
      });
      filesToTranspile = getFilesToTranspileFromProgram(innerProgram);
    }

    // Prefer the builder program, since it is what gives us incremental builds
    const genericProgram: TTypescript.BuilderProgram | TTypescript.Program = builderProgram || innerProgram;

    this._logReadPerformance(ts);
    //#endregion

    if (isolatedModules) {
      // Kick the transpilation worker.
      this._queueTranspileInWorker(tool, genericProgram.getCompilerOptions(), filesToTranspile);
    }

    //#region ANALYSIS
    const { duration: diagnosticsDurationMs, diagnostics: preDiagnostics } = measureTsPerformance(
      'Analyze',
      () => {
        const rawDiagnostics: TTypescript.Diagnostic[] = [
          ...genericProgram.getConfigFileParsingDiagnostics(),
          ...genericProgram.getOptionsDiagnostics(),
          ...genericProgram.getSyntacticDiagnostics(),
          ...genericProgram.getGlobalDiagnostics(),
          ...genericProgram.getSemanticDiagnostics()
        ];
        return { diagnostics: rawDiagnostics };
      }
    );
    this._typescriptTerminal.writeVerboseLine(`Analyze: ${diagnosticsDurationMs}ms`);
    //#endregion

    //#region EMIT
    const { changedFiles } = configureProgramForMultiEmit(innerProgram, ts, this._moduleKindsToEmit, mode);

    const emitResult: TTypescript.EmitResult = genericProgram.emit(
      undefined,
      // The writeFile callback must be provided for the multi-emit redirector
      ts.sys.writeFile,
      undefined,
      undefined,
      undefined
    );

    this._cleanupWorker();
    //#endregion

    this._logEmitPerformance(ts);

    //#region FINAL_ANALYSIS
    // Need to ensure that we include emit diagnostics, since they might not be part of the other sets
    const rawDiagnostics: TTypescript.Diagnostic[] = [...preDiagnostics, ...emitResult.diagnostics];
    //#endregion

    this._configuration.emitChangedFilesCallback(innerProgram, changedFiles);

    if (pendingTranspilePromises.size) {
      const emitResults: TTypescript.EmitResult[] = await Promise.all(pendingTranspilePromises.values());
      for (const { diagnostics } of emitResults) {
        for (const diagnostic of diagnostics) {
          rawDiagnostics.push(diagnostic);
        }
      }
    }

    this._logDiagnostics(ts, rawDiagnostics);
    // Reset performance counters in case any are used in the callback
    ts.performance.disable();
    ts.performance.enable();
  }

  public async _runSolutionBuildAsync(tool: ITypeScriptTool): Promise<void> {
    this._typescriptTerminal.writeVerboseLine(`Using solution mode`);

    const { ts, measureSync, rawDiagnostics, pendingTranspilePromises } = tool;
    rawDiagnostics.length = 0;

    if (!tool.solutionBuilder) {
      //#region CONFIGURE
      const { duration: configureDurationMs, solutionBuilderHost } = measureSync('Configure', () => {
        const _tsconfig: TTypescript.ParsedCommandLine = this._loadTsconfig(ts);
        this._validateTsconfig(ts, _tsconfig);

        const _solutionBuilderHost: TSolutionHost = this._buildSolutionBuilderHost(tool);

        return {
          solutionBuilderHost: _solutionBuilderHost
        };
      });
      this._typescriptTerminal.writeVerboseLine(`Configure: ${configureDurationMs}ms`);
      //#endregion

      tool.solutionBuilder = ts.createSolutionBuilder(
        solutionBuilderHost,
        [this._configuration.tsconfigPath],
        {}
      ) as IExtendedSolutionBuilder;
    } else {
      // Force reload everything from disk
      for (const project of tool.solutionBuilder.getBuildOrder()) {
        tool.solutionBuilder.invalidateProject(project, 1);
      }
    }

    //#region EMIT
    // Ignoring the exit status because we only care about presence of diagnostics
    tool.solutionBuilder.build();
    this._cleanupWorker();
    //#endregion

    if (pendingTranspilePromises.size) {
      const emitResults: TTypescript.EmitResult[] = await Promise.all(pendingTranspilePromises.values());
      for (const { diagnostics } of emitResults) {
        for (const diagnostic of diagnostics) {
          rawDiagnostics.push(diagnostic);
        }
      }
    }

    this._logDiagnostics(ts, rawDiagnostics, true);
  }

  private _logDiagnostics(
    ts: ExtendedTypeScript,
    rawDiagnostics: TTypescript.Diagnostic[],
    isSolutionMode?: boolean
  ): void {
    const diagnostics: readonly TTypescript.Diagnostic[] = ts.sortAndDeduplicateDiagnostics(rawDiagnostics);

    if (diagnostics.length > 0) {
      let warningCount: number = 0;
      let hasError: boolean = false;

      this._typescriptTerminal.writeLine(
        `Encountered ${diagnostics.length} TypeScript issue${diagnostics.length > 1 ? 's' : ''}:`
      );
      for (const diagnostic of diagnostics) {
        const diagnosticCategory: TTypescript.DiagnosticCategory = this._getAdjustedDiagnosticCategory(
          diagnostic,
          ts
        );

        if (diagnosticCategory === ts.DiagnosticCategory.Warning) {
          warningCount++;
        } else if (diagnosticCategory === ts.DiagnosticCategory.Error) {
          hasError = true;
        }

        this._printDiagnosticMessage(ts, diagnostic, diagnosticCategory);
      }

      if (isSolutionMode && warningCount > 0 && !hasError) {
        this._typescriptLogger.emitError(
          new Error(
            `TypeScript encountered ${warningCount} warning${warningCount === 1 ? '' : 's'} ` +
              `and is configured to build project references. As a result, no files were emitted. Please fix the reported warnings to proceed.`
          )
        );
      }
    }
  }

  private _logEmitPerformance(ts: ExtendedTypeScript): void {
    this._typescriptTerminal.writeVerboseLine(`Bind: ${ts.performance.getDuration('Bind')}ms`);
    this._typescriptTerminal.writeVerboseLine(`Check: ${ts.performance.getDuration('Check')}ms`);
    this._typescriptTerminal.writeVerboseLine(
      `Transform: ${ts.performance.getDuration('transformTime')}ms ` +
        `(${ts.performance.getCount('beforeTransform')} files)`
    );
    this._typescriptTerminal.writeVerboseLine(
      `Print: ${ts.performance.getDuration('printTime')}ms ` +
        `(${ts.performance.getCount('beforePrint')} files) (Includes Transform)`
    );
    this._typescriptTerminal.writeVerboseLine(
      `Emit: ${ts.performance.getDuration('Emit')}ms (Includes Print)`
    );
    this._typescriptTerminal.writeVerboseLine(
      `I/O Write: ${ts.performance.getDuration('I/O Write')}ms (${ts.performance.getCount(
        'beforeIOWrite'
      )} files)`
    );
  }

  private _logReadPerformance(ts: ExtendedTypeScript): void {
    this._typescriptTerminal.writeVerboseLine(
      `I/O Read: ${ts.performance.getDuration('I/O Read')}ms (${ts.performance.getCount(
        'beforeIORead'
      )} files)`
    );
    this._typescriptTerminal.writeVerboseLine(
      `Parse: ${ts.performance.getDuration('Parse')}ms (${ts.performance.getCount('beforeParse')} files)`
    );
    this._typescriptTerminal.writeVerboseLine(
      `Program (includes Read + Parse): ${ts.performance.getDuration('Program')}ms`
    );
  }

  private _printDiagnosticMessage(
    ts: ExtendedTypeScript,
    diagnostic: TTypescript.Diagnostic,
    diagnosticCategory: TTypescript.DiagnosticCategory = this._getAdjustedDiagnosticCategory(diagnostic, ts)
  ): void {
    // Code taken from reference example
    let diagnosticMessage: string;
    let errorObject: Error;
    if (diagnostic.file) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
      const message: string = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      const formattedMessage: string = `(TS${diagnostic.code}) ${message}`;
      errorObject = new FileError(formattedMessage, {
        absolutePath: diagnostic.file.fileName,
        projectFolder: this._configuration.buildFolderPath,
        line: line + 1,
        column: character + 1
      });
      diagnosticMessage = errorObject.toString();
    } else {
      diagnosticMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      errorObject = new Error(diagnosticMessage);
    }

    switch (diagnosticCategory) {
      case ts.DiagnosticCategory.Error: {
        this._typescriptLogger.emitError(errorObject);
        break;
      }

      case ts.DiagnosticCategory.Warning: {
        this._typescriptLogger.emitWarning(errorObject);
        break;
      }

      default: {
        this._typescriptTerminal.writeLine(...diagnosticMessage);
        break;
      }
    }
  }

  private _getAdjustedDiagnosticCategory(
    diagnostic: TTypescript.Diagnostic,
    ts: ExtendedTypeScript
  ): TTypescript.DiagnosticCategory {
    // Workaround for https://github.com/microsoft/TypeScript/issues/40058
    // The compiler reports a hard error for issues such as this:
    //
    //    error TS6133: 'x' is declared but its value is never read.
    //
    // These should properly be treated as warnings, because they are purely cosmetic issues.
    // TODO: Maybe heft should provide a config file for managing DiagnosticCategory mappings.
    if (diagnostic.reportsUnnecessary && diagnostic.category === ts.DiagnosticCategory.Error) {
      return ts.DiagnosticCategory.Warning;
    }

    // These pedantic checks also should not be treated as hard errors
    if (this._suppressedDiagnosticCodes.has(diagnostic.code)) {
      return ts.DiagnosticCategory.Warning;
    }

    return diagnostic.category;
  }

  private _validateTsconfig(ts: ExtendedTypeScript, tsconfig: TTypescript.ParsedCommandLine): void {
    if (
      (tsconfig.options.module && !tsconfig.options.outDir) ||
      (!tsconfig.options.module && tsconfig.options.outDir)
    ) {
      throw new Error(
        'If either the module or the outDir option is provided in the tsconfig compilerOptions, both must be provided'
      );
    }

    this._moduleKindsToEmit = [];
    const specifiedKinds: Map<TTypescript.ModuleKind, IModuleKindReason> = new Map();
    const specifiedOutDirs: Map<string, IModuleKindReason> = new Map();

    if (!tsconfig.options.module) {
      throw new Error(
        'If the module tsconfig compilerOption is not provided, the builder must be provided with the ' +
          'additionalModuleKindsToEmit configuration option.'
      );
    }

    if (this._configuration.emitCjsExtensionForCommonJS) {
      this._addModuleKindToEmit(
        ts.ModuleKind.CommonJS,
        tsconfig.options.outDir!,
        /* isPrimary */ tsconfig.options.module === ts.ModuleKind.CommonJS,
        '.cjs'
      );

      const cjsReason: IModuleKindReason = {
        outDir: tsconfig.options.outDir!,
        kind: 'CommonJS',
        extension: '.cjs',
        reason: 'emitCjsExtensionForCommonJS'
      };

      specifiedKinds.set(ts.ModuleKind.CommonJS, cjsReason);
      specifiedOutDirs.set(`${tsconfig.options.outDir!}:.cjs`, cjsReason);
    }

    if (this._configuration.emitMjsExtensionForESModule) {
      this._addModuleKindToEmit(
        ts.ModuleKind.ESNext,
        tsconfig.options.outDir!,
        /* isPrimary */ tsconfig.options.module === ts.ModuleKind.ESNext,
        '.mjs'
      );

      const mjsReason: IModuleKindReason = {
        outDir: tsconfig.options.outDir!,
        kind: 'ESNext',
        extension: '.mjs',
        reason: 'emitMjsExtensionForESModule'
      };

      specifiedKinds.set(ts.ModuleKind.ESNext, mjsReason);
      specifiedOutDirs.set(`${tsconfig.options.outDir!}:.mjs`, mjsReason);
    }

    if (!specifiedKinds.has(tsconfig.options.module)) {
      this._addModuleKindToEmit(
        tsconfig.options.module,
        tsconfig.options.outDir!,
        /* isPrimary */ true,
        /* jsExtensionOverride */ undefined
      );

      const tsConfigReason: IModuleKindReason = {
        outDir: tsconfig.options.outDir!,
        kind: ts.ModuleKind[tsconfig.options.module] as keyof typeof TTypescript.ModuleKind,
        extension: '.js',
        reason: 'tsconfig.json'
      };

      specifiedKinds.set(tsconfig.options.module, tsConfigReason);
      specifiedOutDirs.set(`${tsconfig.options.outDir!}:.js`, tsConfigReason);
    }

    if (this._configuration.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of this._configuration.additionalModuleKindsToEmit) {
        const moduleKind: TTypescript.ModuleKind = this._parseModuleKind(
          ts,
          additionalModuleKindToEmit.moduleKind
        );

        const outDirKey: string = `${additionalModuleKindToEmit.outFolderName}:.js`;
        const moduleKindReason: IModuleKindReason = {
          kind: ts.ModuleKind[moduleKind] as keyof typeof TTypescript.ModuleKind,
          outDir: additionalModuleKindToEmit.outFolderName,
          extension: '.js',
          reason: `additionalModuleKindsToEmit`
        };

        const existingKind: IModuleKindReason | undefined = specifiedKinds.get(moduleKind);
        const existingDir: IModuleKindReason | undefined = specifiedOutDirs.get(outDirKey);

        if (existingKind) {
          throw new Error(
            `Module kind "${additionalModuleKindToEmit.moduleKind}" is already emitted at ${existingKind.outDir} with extension '${existingKind.extension}' by option ${existingKind.reason}.`
          );
        } else if (existingDir) {
          throw new Error(
            `Output folder "${additionalModuleKindToEmit.outFolderName}" already contains module kind ${existingDir.kind} with extension '${existingDir.extension}', specified by option ${existingDir.reason}.`
          );
        } else {
          const outFolderKey: string | undefined = this._addModuleKindToEmit(
            moduleKind,
            additionalModuleKindToEmit.outFolderName,
            /* isPrimary */ false,
            undefined
          );

          if (outFolderKey) {
            specifiedKinds.set(moduleKind, moduleKindReason);
            specifiedOutDirs.set(outFolderKey, moduleKindReason);
          }
        }
      }
    }
  }

  private _addModuleKindToEmit(
    moduleKind: TTypescript.ModuleKind,
    outFolderPath: string,
    isPrimary: boolean,
    jsExtensionOverride: string | undefined
  ): string | undefined {
    let outFolderName: string;
    if (path.isAbsolute(outFolderPath)) {
      outFolderName = path.relative(this._configuration.buildFolderPath, outFolderPath);
    } else {
      outFolderName = outFolderPath;
      outFolderPath = path.resolve(this._configuration.buildFolderPath, outFolderPath);
    }

    outFolderPath = Path.convertToSlashes(outFolderPath);
    outFolderPath = outFolderPath.replace(/\/*$/, '/'); // Ensure the outFolderPath ends with a slash

    for (const existingModuleKindToEmit of this._moduleKindsToEmit) {
      let errorText: string | undefined;

      if (existingModuleKindToEmit.outFolderPath === outFolderPath) {
        if (existingModuleKindToEmit.jsExtensionOverride === jsExtensionOverride) {
          errorText =
            'Unable to output two different module kinds with the same ' +
            `module extension (${jsExtensionOverride || '.js'}) to the same ` +
            `folder ("${outFolderPath}").`;
        }
      } else {
        let parentFolder: string | undefined;
        let childFolder: string | undefined;
        if (outFolderPath.startsWith(existingModuleKindToEmit.outFolderPath)) {
          parentFolder = outFolderPath;
          childFolder = existingModuleKindToEmit.outFolderPath;
        } else if (existingModuleKindToEmit.outFolderPath.startsWith(outFolderPath)) {
          parentFolder = existingModuleKindToEmit.outFolderPath;
          childFolder = outFolderPath;
        }

        if (parentFolder) {
          errorText =
            'Unable to output two different module kinds to nested folders ' +
            `("${parentFolder}" and "${childFolder}").`;
        }
      }

      if (errorText) {
        this._typescriptLogger.emitError(new Error(errorText));
        return undefined;
      }
    }

    this._moduleKindsToEmit.push({
      outFolderPath,
      moduleKind,
      jsExtensionOverride,

      isPrimary
    });

    return `${outFolderName}:${jsExtensionOverride || '.js'}`;
  }

  private _loadTsconfig(ts: ExtendedTypeScript): TTypescript.ParsedCommandLine {
    const parsedConfigFile: ReturnType<typeof ts.readConfigFile> = ts.readConfigFile(
      this._configuration.tsconfigPath,
      ts.sys.readFile
    );

    const currentFolder: string = path.dirname(this._configuration.tsconfigPath);
    const tsconfig: TTypescript.ParsedCommandLine = ts.parseJsonConfigFileContent(
      parsedConfigFile.config,
      {
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        useCaseSensitiveFileNames: true
      },
      currentFolder,
      /*existingOptions:*/ undefined,
      this._configuration.tsconfigPath
    );

    if (tsconfig.options.incremental) {
      tsconfig.options.tsBuildInfoFile = this._tsCacheFilePath;
    }

    return tsconfig;
  }

  private _getCreateBuilderProgram(
    ts: ExtendedTypeScript
  ): TTypescript.CreateProgram<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram> {
    const {
      _configuration: { emitChangedFilesCallback }
    } = this;

    const createMultiEmitBuilderProgram: TTypescript.CreateProgram<
      TTypescript.EmitAndSemanticDiagnosticsBuilderProgram
    > = (
      fileNames: readonly string[] | undefined,
      compilerOptions: TTypescript.CompilerOptions | undefined,
      host: TTypescript.CompilerHost | undefined,
      oldProgram: TTypescript.EmitAndSemanticDiagnosticsBuilderProgram | undefined,
      configFileParsingDiagnostics: readonly TTypescript.Diagnostic[] | undefined,
      projectReferences: readonly TTypescript.ProjectReference[] | undefined
    ): TTypescript.EmitAndSemanticDiagnosticsBuilderProgram => {
      // Reset performance counters
      ts.performance.disable();
      ts.performance.enable();

      this._typescriptTerminal.writeVerboseLine(`Reading program "${compilerOptions!.configFilePath}"`);

      const newProgram: TTypescript.EmitAndSemanticDiagnosticsBuilderProgram =
        ts.createEmitAndSemanticDiagnosticsBuilderProgram(
          fileNames,
          compilerOptions,
          host,
          oldProgram,
          configFileParsingDiagnostics,
          projectReferences
        );

      this._logReadPerformance(ts);

      const isolatedModules: boolean =
        !!this._configuration.useTranspilerWorker && !!compilerOptions!.isolatedModules;
      const mode: 'both' | 'declaration' = isolatedModules ? 'declaration' : 'both';

      if (isolatedModules) {
        // Kick the transpilation worker.
        const filesToTranspile: Map<string, string> = getFilesToTranspileFromBuilderProgram(newProgram);
        this._queueTranspileInWorker(this._tool!, compilerOptions!, filesToTranspile);
      }

      const { emit: originalEmit } = newProgram;

      const emit: TTypescript.Program['emit'] = (
        outerTargetSourceFile?: TTypescript.SourceFile,
        outerWriteFile?: TTypescript.WriteFileCallback,
        outerCancellationToken?: TTypescript.CancellationToken,
        outerEmitOnlyDtsFiles?: boolean,
        outerCustomTransformers?: TTypescript.CustomTransformers
      ) => {
        const innerProgram: TTypescript.Program = newProgram.getProgram();

        const innerCompilerOptions: TTypescript.CompilerOptions = innerProgram.getCompilerOptions();

        const { changedFiles } = configureProgramForMultiEmit(
          innerProgram,
          ts,
          this._moduleKindsToEmit,
          mode
        );

        const result: TTypescript.EmitResult = originalEmit.call(
          newProgram,
          outerTargetSourceFile,
          outerWriteFile,
          outerCancellationToken,
          outerEmitOnlyDtsFiles,
          outerCustomTransformers
        );

        (result as IExtendedEmitResult).changedSourceFiles = changedFiles;

        this._typescriptTerminal.writeVerboseLine(
          `Emitting program "${innerCompilerOptions!.configFilePath}"`
        );

        this._logEmitPerformance(ts);

        // Reset performance counters
        ts.performance.disable();
        ts.performance.enable();

        emitChangedFilesCallback(innerProgram, changedFiles);

        return result;
      };

      newProgram.emit = emit;

      return newProgram;
    };

    return createMultiEmitBuilderProgram;
  }

  private _buildSolutionBuilderHost(tool: ITypeScriptTool): TSolutionHost {
    const reportSolutionBuilderStatus: TTypescript.DiagnosticReporter = tool.reportDiagnostic;
    const reportEmitErrorSummary: TTypescript.ReportEmitErrorSummary = (errorCount: number): void => {
      // Do nothing
    };

    const { ts } = tool;

    const solutionBuilderHost: TTypescript.SolutionBuilderHost<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram> =
      ts.createSolutionBuilderHost(
        ts.sys,
        this._getCreateBuilderProgram(ts),
        tool.reportDiagnostic,
        reportSolutionBuilderStatus,
        reportEmitErrorSummary
      );

    solutionBuilderHost.afterProgramEmitAndDiagnostics = (
      program: TTypescript.EmitAndSemanticDiagnosticsBuilderProgram
    ) => {
      // Use the native metric since we aren't overwriting the writer
      this._typescriptTerminal.writeVerboseLine(
        `I/O Write: ${ts.performance.getDuration('I/O Write')}ms (${ts.performance.getCount(
          'beforeIOWrite'
        )} files)`
      );
    };

    return solutionBuilderHost;
  }

  private _buildIncrementalCompilerHost(
    tool: ITypeScriptTool,
    tsconfig: TTypescript.ParsedCommandLine
  ): TTypescript.CompilerHost {
    const { ts, system } = tool;

    let compilerHost: TTypescript.CompilerHost | undefined;

    if (tsconfig.options.incremental) {
      compilerHost = ts.createIncrementalCompilerHost(tsconfig.options, system);
    } else {
      compilerHost = ts.createCompilerHost(tsconfig.options, undefined, system);
    }

    this._changeCompilerHostToUseCache(compilerHost, tool);

    return compilerHost;
  }

  private _buildWatchCompilerHost(
    tool: ITypeScriptTool,
    tsconfig: TTypescript.ParsedCommandLine
  ): TWatchCompilerHost {
    const { ts, system } = tool;

    const reportWatchStatus: TTypescript.DiagnosticReporter = (diagnostic: TTypescript.Diagnostic): void => {
      this._printDiagnosticMessage(ts, diagnostic);
    };

    const compilerHost: TWatchCompilerHost = ts.createWatchCompilerHost(
      tsconfig.fileNames,
      tsconfig.options,
      system,
      this._getCreateBuilderProgram(ts),
      tool.reportDiagnostic,
      reportWatchStatus,
      tsconfig.projectReferences,
      tsconfig.watchOptions
    );

    return compilerHost;
  }

  private _changeCompilerHostToUseCache(compilerHost: TTypescript.CompilerHost, tool: ITypeScriptTool): void {
    const { sourceFileCache } = tool;

    const { getSourceFile: innerGetSourceFile } = compilerHost;
    if ((innerGetSourceFile as { cache?: typeof sourceFileCache }).cache === sourceFileCache) {
      return;
    }

    compilerHost.getCurrentDirectory = () => this._configuration.buildFolderPath;

    // Enable source file persistence
    const getSourceFile: typeof innerGetSourceFile & {
      cache?: typeof sourceFileCache;
    } = (
      fileName: string,
      languageVersionOrOptions: TTypescript.ScriptTarget | TTypescript.CreateSourceFileOptions,
      onError?: ((message: string) => void) | undefined,
      shouldCreateNewSourceFile?: boolean | undefined
    ): TTypescript.SourceFile | undefined => {
      if (!shouldCreateNewSourceFile) {
        const cachedSourceFile: TTypescript.SourceFile | undefined = sourceFileCache.get(fileName);
        if (cachedSourceFile) {
          return cachedSourceFile;
        }
      }

      const result: TTypescript.SourceFile | undefined = innerGetSourceFile(
        fileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile
      );
      if (result) {
        sourceFileCache.set(fileName, result);
      } else {
        sourceFileCache.delete(fileName);
      }
      return result;
    };

    getSourceFile.cache = sourceFileCache;

    compilerHost.getSourceFile = getSourceFile;
  }

  private _buildWatchSolutionBuilderHost(tool: ITypeScriptTool): TWatchSolutionHost {
    const { reportDiagnostic, ts, system } = tool;

    const host: TWatchSolutionHost = ts.createSolutionBuilderWithWatchHost(
      system,
      this._getCreateBuilderProgram(ts),
      reportDiagnostic,
      reportDiagnostic,
      reportDiagnostic
    );

    return host;
  }

  private _parseModuleKind(ts: ExtendedTypeScript, moduleKindName: string): TTypescript.ModuleKind {
    switch (moduleKindName.toLowerCase()) {
      case 'commonjs':
        return ts.ModuleKind.CommonJS;

      case 'amd':
        return ts.ModuleKind.AMD;

      case 'umd':
        return ts.ModuleKind.UMD;

      case 'system':
        return ts.ModuleKind.System;

      case 'es2015':
        return ts.ModuleKind.ES2015;

      case 'esnext':
        return ts.ModuleKind.ESNext;

      default:
        throw new Error(`"${moduleKindName}" is not a valid module kind name.`);
    }
  }

  private _queueTranspileInWorker(
    tool: ITypeScriptTool,
    compilerOptions: TTypescript.CompilerOptions,
    filesToTranspile: Map<string, string>
  ): void {
    const { pendingTranspilePromises, pendingTranspileSignals } = tool;
    let maybeWorker: Worker | undefined = tool.worker;
    if (!maybeWorker) {
      const workerData: ITypescriptWorkerData = {
        typeScriptToolPath: this._configuration.typeScriptToolPath
      };
      tool.worker = maybeWorker = new Worker(require.resolve('./TranspilerWorker.js'), {
        workerData: workerData
      });

      maybeWorker.on('message', (response: ITranspilationResponseMessage) => {
        const { requestId: resolvingRequestId, type, result } = response;
        const signal: ITranspileSignal | undefined = pendingTranspileSignals.get(resolvingRequestId);

        if (type === 'error') {
          const error: Error = Object.assign(new Error(result.message), result);
          if (signal) {
            signal.reject(error);
          } else {
            this._typescriptTerminal.writeErrorLine(
              `Unexpected worker rejection for request with id ${resolvingRequestId}: ${error}`
            );
          }
        } else if (signal) {
          signal.resolve(result);
        } else {
          this._typescriptTerminal.writeErrorLine(
            `Unexpected worker resolution for request with id ${resolvingRequestId}`
          );
        }

        pendingTranspileSignals.delete(resolvingRequestId);
        pendingTranspilePromises.delete(resolvingRequestId);
      });

      maybeWorker.once('exit', (exitCode: number) => {
        if (pendingTranspileSignals.size) {
          const error: Error = new Error(`Worker exited unexpectedly with code ${exitCode}.`);
          for (const { reject: rejectTranspile } of pendingTranspileSignals.values()) {
            rejectTranspile(error);
          }
          pendingTranspileSignals.clear();
        }
      });

      maybeWorker.once('error', (err: Error) => {
        for (const { reject: rejectTranspile } of pendingTranspileSignals.values()) {
          rejectTranspile(err);
        }
        pendingTranspileSignals.clear();
      });
    }

    // make linter happy
    const worker: Worker = maybeWorker;

    const requestId: number = ++this._nextRequestId;
    const transpilePromise: Promise<TTypescript.EmitResult> = new Promise(
      (resolve: (result: TTypescript.EmitResult) => void, reject: (err: Error) => void) => {
        pendingTranspileSignals.set(requestId, { resolve, reject });

        this._typescriptTerminal.writeLine(`Asynchronously transpiling ${compilerOptions.configFilePath}`);
        const request: ITranspilationRequestMessage = {
          compilerOptions,
          filesToTranspile,
          moduleKindsToEmit: this._moduleKindsToEmit,
          requestId
        };

        worker.postMessage(request);
      }
    );

    pendingTranspilePromises.set(requestId, transpilePromise);
  }

  private _cleanupWorker(): void {
    const tool: ITypeScriptTool | undefined = this._tool;
    if (!tool) {
      return;
    }

    const { worker } = tool;
    if (worker) {
      worker.postMessage(false);
      tool.worker = undefined;
    }
  }
}

function getFilesToTranspileFromBuilderProgram(
  builderProgram: TTypescript.BuilderProgram
): Map<string, string> {
  const changedFilesSet: Set<string> = (
    builderProgram as unknown as { getState(): { changedFilesSet: Set<string> } }
  ).getState().changedFilesSet;
  const filesToTranspile: Map<string, string> = new Map();
  for (const fileName of changedFilesSet) {
    const sourceFile: TTypescript.SourceFile | undefined = builderProgram.getSourceFile(fileName);
    if (sourceFile && !sourceFile.isDeclarationFile) {
      filesToTranspile.set(sourceFile.fileName, sourceFile.text);
    }
  }
  return filesToTranspile;
}

function getFilesToTranspileFromProgram(program: TTypescript.Program): Map<string, string> {
  const filesToTranspile: Map<string, string> = new Map();
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      filesToTranspile.set(sourceFile.fileName, sourceFile.text);
    }
  }
  return filesToTranspile;
}
