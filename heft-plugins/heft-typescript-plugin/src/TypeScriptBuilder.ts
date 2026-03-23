// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import type * as TTypescript from 'typescript';

import { Path, FileError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { HeftConfiguration, IScopedLogger } from '@rushstack/heft';

import type {
  ExtendedBuilderProgram,
  ExtendedTypeScript,
  IExtendedSolutionBuilder,
  ITypeScriptNodeSystem
} from './internalTypings/TypeScriptInternals';
import type { ITypeScriptConfigurationJson, IEmitModuleKind } from './TypeScriptPlugin';
import type { PerformanceMeasurer } from './Performance';
import type {
  ICachedEmitModuleKind,
  ITranspilationRequestMessage,
  ITranspilationResponseMessage,
  ITypescriptWorkerData
} from './types';
import { configureProgramForMultiEmit } from './configureProgramForMultiEmit';
import { loadTsconfig } from './tsconfigLoader';
import { loadTypeScriptToolAsync } from './loadTypeScriptTool';

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
  heftConfiguration: HeftConfiguration;

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

/**
 * @internal
 */
export interface IBaseTypeScriptTool<TSystem extends TTypescript.System = TTypescript.System> {
  typeScriptToolPath: string;
  ts: ExtendedTypeScript;
  system: TSystem;
}

interface ITypeScriptTool extends IBaseTypeScriptTool<ITypeScriptNodeSystem> {
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

      // Relativize the outFolderName paths before hashing to ensure portability across different machines
      const normalizedConfig: IEmitModuleKind[] =
        this._configuration.additionalModuleKindsToEmit?.map((emitKind) => ({
          ...emitKind,
          outFolderName: Path.convertToSlashes(
            path.relative(this._configuration.buildFolderPath, emitKind.outFolderName)
          )
        })) || [];

      configHash.update(JSON.stringify(normalizedConfig));
      const serializedConfigHash: string = configHash.digest('base64url').slice(0, 8);

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
      const {
        tool: { ts, system: baseSystem, typeScriptToolPath }
      } = await loadTypeScriptToolAsync({
        terminal: this._typescriptTerminal,
        heftConfiguration: this._configuration.heftConfiguration,
        buildProjectReferences: this._configuration.buildProjectReferences,
        onlyResolveSymlinksInNodeModules: this._configuration.onlyResolveSymlinksInNodeModules
      });
      this._useSolutionBuilder = !!this._configuration.buildProjectReferences;

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

      const getCurrentDirectory: () => string = () => this._configuration.buildFolderPath;

      // Need to also update watchFile and watchDirectory
      const system: ITypeScriptNodeSystem = {
        ...baseSystem,
        getCurrentDirectory,
        clearTimeout,
        setTimeout
      };
      const { realpath } = system;

      if (realpath && system.getAccessibleFileSystemEntries) {
        const { getAccessibleFileSystemEntries } = system;
        system.readDirectory = (folderPath, extensions, exclude, include, depth): string[] => {
          return ts.matchFiles(
            folderPath,
            extensions,
            exclude,
            include,
            ts.sys.useCaseSensitiveFileNames,
            getCurrentDirectory(),
            depth,
            getAccessibleFileSystemEntries,
            realpath,
            ts.sys.directoryExists
          );
        };
      }

      this._tool = {
        typeScriptToolPath,
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
        const _tsconfig: TTypescript.ParsedCommandLine = loadTsconfig({
          tool,
          tsconfigPath: this._configuration.tsconfigPath,
          tsCacheFilePath: this._tsCacheFilePath
        });
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
      const _tsconfig: TTypescript.ParsedCommandLine = loadTsconfig({
        tool,
        tsconfigPath: this._configuration.tsconfigPath,
        tsCacheFilePath: this._tsCacheFilePath
      });
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

    this._emitModulePackageJsonFiles(ts);
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
        const _tsconfig: TTypescript.ParsedCommandLine = loadTsconfig({
          tool,
          tsconfigPath: this._configuration.tsconfigPath,
          tsCacheFilePath: this._tsCacheFilePath
        });
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

    this._emitModulePackageJsonFiles(ts);

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
        '.cjs',
        /* emitModulePackageJson */ false
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
        '.mjs',
        /* emitModulePackageJson */ false
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
        /* jsExtensionOverride */ undefined,
        /* emitModulePackageJson */ false
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
      for (const { moduleKind: moduleKindString, outFolderName, emitModulePackageJson = false } of this
        ._configuration.additionalModuleKindsToEmit) {
        const moduleKind: TTypescript.ModuleKind = this._parseModuleKind(ts, moduleKindString);

        const outDirKey: string = `${outFolderName}:.js`;
        const moduleKindReason: IModuleKindReason = {
          kind: ts.ModuleKind[moduleKind] as keyof typeof TTypescript.ModuleKind,
          outDir: outFolderName,
          extension: '.js',
          reason: `additionalModuleKindsToEmit`
        };

        const existingKind: IModuleKindReason | undefined = specifiedKinds.get(moduleKind);
        const existingDir: IModuleKindReason | undefined = specifiedOutDirs.get(outDirKey);

        if (existingKind) {
          throw new Error(
            `Module kind "${moduleKind}" is already emitted at ${existingKind.outDir} with extension '${existingKind.extension}' by option ${existingKind.reason}.`
          );
        } else if (existingDir) {
          throw new Error(
            `Output folder "${outFolderName}" already contains module kind ${existingDir.kind} with extension '${existingDir.extension}', specified by option ${existingDir.reason}.`
          );
        } else {
          const outFolderKey: string | undefined = this._addModuleKindToEmit(
            moduleKind,
            outFolderName,
            /* isPrimary */ false,
            undefined,
            emitModulePackageJson
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
    jsExtensionOverride: string | undefined,
    emitModulePackageJson: boolean
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
      isPrimary,
      emitModulePackageJson
    });

    return `${outFolderName}:${jsExtensionOverride || '.js'}`;
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

        this._emitModulePackageJsonFiles(ts);
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

    const { ts, system } = tool;

    const solutionBuilderHost: TTypescript.SolutionBuilderHost<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram> =
      ts.createSolutionBuilderHost(
        system,
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
      compilerHost = (ts.createCompilerHostWorker ?? ts.createCompilerHost)(
        tsconfig.options,
        undefined,
        system
      );
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

  /**
   * For each module kind configured with `emitModulePackageJson: true`, writes a
   * `package.json` with the appropriate `"type"` field to ensure Node.js correctly
   * interprets `.js` files in the output folder.
   */
  private _emitModulePackageJsonFiles(ts: ExtendedTypeScript): void {
    for (const { emitModulePackageJson, moduleKind, outFolderPath } of this._moduleKindsToEmit) {
      if (!emitModulePackageJson) {
        continue;
      }

      // "module" and "commonjs" are the only recognized values. See
      // https://nodejs.org/api/packages.html#type
      let moduleType: string | undefined;
      switch (moduleKind) {
        // UMD contains a CommonJS wrapper, so it should be treated as CommonJS for package.json generation purposes
        case ts.ModuleKind.UMD:
        case ts.ModuleKind.CommonJS: {
          moduleType = 'commonjs';
          break;
        }

        case ts.ModuleKind.AMD:
        case ts.ModuleKind.None:
        case ts.ModuleKind.Preserve:
        case ts.ModuleKind.System: {
          moduleType = undefined;
          break;
        }

        default: {
          moduleType = 'module';
          break;
        }
      }

      if (moduleType) {
        const packageJsonPath: string = `${outFolderPath}package.json`;
        const packageJsonContent: string = `{\n  "type": "${moduleType}"\n}\n`;

        ts.sys.writeFile(packageJsonPath, packageJsonContent);
        this._typescriptTerminal.writeVerboseLine(`Wrote ${packageJsonPath} with "type": "${moduleType}"`);
      } else {
        throw new Error(
          `Unsupported module kind ${ts.ModuleKind[moduleKind]} for package.json generation. ` +
            `Remove the \`emitModulePackageJson\` option for this module kind.`
        );
      }
    }
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
    const { typeScriptToolPath, pendingTranspilePromises, pendingTranspileSignals } = tool;
    let maybeWorker: Worker | undefined = tool.worker;
    if (!maybeWorker) {
      const workerData: ITypescriptWorkerData = {
        typeScriptToolPath
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
  const program: ExtendedBuilderProgram = builderProgram as unknown as ExtendedBuilderProgram;
  // getState was removed in Typescript 5.6, replaced with state
  const changedFilesSet: Set<string> = (program.state ?? program.getState()).changedFilesSet;

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
