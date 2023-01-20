// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import * as path from 'path';
import * as semver from 'semver';
import type * as TTypescript from 'typescript';
import {
  type FileSystemStats,
  type ITerminal,
  JsonFile,
  IPackageJson,
  FileSystem,
  Path,
  Async,
  FileError
} from '@rushstack/node-core-library';
import type { IChangedFileState, IScopedLogger } from '@rushstack/heft';

import type { ExtendedTypeScript, IExtendedSolutionBuilder } from './internalTypings/TypeScriptInternals';
import { EmitFilesPatch, type ICachedEmitModuleKind } from './EmitFilesPatch';
import { TypeScriptCachedFileSystem } from './fileSystem/TypeScriptCachedFileSystem';
import type { ITypeScriptConfigurationJson } from './TypeScriptPlugin';
import type { PerformanceMeasurer, PerformanceMeasurerAsync } from './Performance';

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
   * Set this to change the maximum number of file handles that will be opened concurrently for writing.
   * The default is 50.
   */
  maxWriteParallelism: number;

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
// type TWatchCompilerHost =
//   TTypescript.WatchCompilerHostOfFilesAndCompilerOptions<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram>;
// type TWatchSolutionHost =
//   TTypescript.SolutionBuilderWithWatchHost<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram>;

const EMPTY_JSON: object = {};

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

const OLDEST_SUPPORTED_TS_MAJOR_VERSION: number = 2;
const OLDEST_SUPPORTED_TS_MINOR_VERSION: number = 9;

const NEWEST_SUPPORTED_TS_MAJOR_VERSION: number = 4;
const NEWEST_SUPPORTED_TS_MINOR_VERSION: number = 8;

interface ITypeScriptTool {
  ts: ExtendedTypeScript;
  measureSync: PerformanceMeasurer;
  measureAsync: PerformanceMeasurerAsync;

  sourceFileCache: Map<string, TTypescript.SourceFile>;

  oldBuilderProgram: TTypescript.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
  oldProgram: TTypescript.Program | undefined;

  solutionBuilder: IExtendedSolutionBuilder | undefined;

  rawDiagnostics: TTypescript.Diagnostic[];
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

  private __tsCacheFilePath: string | undefined = undefined;
  private _tsReadJsonCache: Map<string, object> = new Map<string, object>();
  private _cachedFileSystem: TypeScriptCachedFileSystem = new TypeScriptCachedFileSystem();

  private _tool: ITypeScriptTool | undefined = undefined;

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

  public async invokeAsync(changedFiles?: ReadonlyMap<string, IChangedFileState> | undefined): Promise<void> {
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

      const measureTsPerformanceAsync: PerformanceMeasurerAsync = async <TResult extends object | void>(
        measurementName: string,
        fn: () => Promise<TResult>
      ) => {
        const beforeName: string = `before${measurementName}`;
        ts.performance.mark(beforeName);
        const resultPromise: Promise<TResult> = fn();
        const result: TResult = await resultPromise;
        const afterName: string = `after${measurementName}`;
        ts.performance.mark(afterName);
        ts.performance.measure(measurementName, beforeName, afterName);
        return {
          ...result,
          duration: ts.performance.getDuration(measurementName)
        };
      };

      this._typescriptTerminal.writeLine(`Using TypeScript version ${ts.version}`);

      this._tool = {
        ts,

        measureSync: measureTsPerformance,
        measureAsync: measureTsPerformanceAsync,

        sourceFileCache: new Map(),

        oldBuilderProgram: undefined,
        oldProgram: undefined,

        solutionBuilder: undefined,

        rawDiagnostics: []
      };
    }

    const { performance } = this._tool.ts;
    // Reset the performance counters to 0 to avoid contamination from previous runs
    performance.disable();
    performance.enable();

    if (changedFiles) {
      const { sourceFileCache } = this._tool;
      for (const file of changedFiles.keys()) {
        // There might need to be a transform to the format of `file` here.
        sourceFileCache.delete(file);
      }
    }

    if (this._useSolutionBuilder) {
      this._runSolutionBuild(this._tool);
    } else {
      await this._runBuildAsync(this._tool);
    }
  }

  public async _runBuildAsync(tool: ITypeScriptTool): Promise<void> {
    const { ts, measureSync: measureTsPerformance, measureAsync: measureTsPerformanceAsync } = tool;

    //#region CONFIGURE
    const {
      duration: configureDurationMs,
      tsconfig,
      compilerHost
    } = measureTsPerformance('Configure', () => {
      this._overrideTypeScriptReadJson(ts);
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
    let builderProgram: TTypescript.EmitAndSemanticDiagnosticsBuilderProgram | undefined = undefined;
    let tsProgram: TTypescript.Program;

    if (tsconfig.options.incremental) {
      if (!tool.oldBuilderProgram) {
        tool.oldBuilderProgram = ts.readBuilderProgram(tsconfig.options, compilerHost);
      }

      builderProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        tsconfig.fileNames,
        tsconfig.options,
        compilerHost,
        tool.oldBuilderProgram,
        ts.getConfigFileParsingDiagnostics(tsconfig),
        tsconfig.projectReferences
      );
      tool.oldBuilderProgram = builderProgram;
      tsProgram = builderProgram.getProgram();
    } else {
      tsProgram = ts.createProgram({
        rootNames: tsconfig.fileNames,
        options: tsconfig.options,
        projectReferences: tsconfig.projectReferences,
        host: compilerHost,
        oldProgram: tool.oldProgram,
        configFileParsingDiagnostics: ts.getConfigFileParsingDiagnostics(tsconfig)
      });
      tool.oldProgram = tsProgram;
    }

    // Prefer the builder program, since it is what gives us incremental builds
    const genericProgram: TTypescript.BuilderProgram | TTypescript.Program = builderProgram || tsProgram;

    this._logReadPerformance(ts);
    //#endregion

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
    const emitResult: IExtendedEmitResult = this._emit(ts, genericProgram);
    //#endregion

    this._logEmitPerformance(ts);

    //#region FINAL_ANALYSIS
    // Need to ensure that we include emit diagnostics, since they might not be part of the other sets
    const rawDiagnostics: TTypescript.Diagnostic[] = [...preDiagnostics, ...emitResult.diagnostics];
    //#endregion

    //#region WRITE
    // Using async file system I/O for theoretically better peak performance
    // Also allows to run concurrently with linting
    const writePromise: Promise<{ duration: number }> = measureTsPerformanceAsync('Write', () =>
      Async.forEachAsync(
        emitResult.filesToWrite,
        async ({ filePath, data }: { filePath: string; data: string }) =>
          this._cachedFileSystem.writeFile(filePath, data, { ensureFolderExists: true }),
        { concurrency: this._configuration.maxWriteParallelism }
      )
    );
    //#endregion

    const { duration: writeDuration } = await writePromise;
    this._typescriptTerminal.writeVerboseLine(
      `I/O Write: ${writeDuration}ms (${emitResult.filesToWrite.length} files)`
    );

    this._logDiagnostics(ts, rawDiagnostics);
    // Reset performance counters in case any are used in the callback
    ts.performance.disable();
    ts.performance.enable();
    this._configuration.emitChangedFilesCallback(tsProgram, emitResult.changedSourceFiles);
  }

  public _runSolutionBuild(tool: ITypeScriptTool): void {
    this._typescriptTerminal.writeVerboseLine(`Using solution mode`);

    const { ts, measureSync, rawDiagnostics } = tool;
    rawDiagnostics.length = 0;

    if (!tool.solutionBuilder) {
      //#region CONFIGURE
      const { duration: configureDurationMs, solutionBuilderHost } = measureSync('Configure', () => {
        const _tsconfig: TTypescript.ParsedCommandLine = this._loadTsconfig(ts);
        this._validateTsconfig(ts, _tsconfig);

        const reportDiagnostic: TTypescript.DiagnosticReporter = (diagnostic: TTypescript.Diagnostic) => {
          rawDiagnostics.push(diagnostic);
        };

        const _solutionBuilderHost: TSolutionHost = this._buildSolutionBuilderHost(tool, reportDiagnostic);

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
    //#endregion

    this._logDiagnostics(ts, rawDiagnostics);
  }

  private _logDiagnostics(ts: ExtendedTypeScript, rawDiagnostics: readonly TTypescript.Diagnostic[]): void {
    const diagnostics: readonly TTypescript.Diagnostic[] = ts.sortAndDeduplicateDiagnostics(rawDiagnostics);

    if (diagnostics.length > 0) {
      this._typescriptTerminal.writeLine(
        `Encountered ${diagnostics.length} TypeScript issue${diagnostics.length > 1 ? 's' : ''}:`
      );
      for (const diagnostic of diagnostics) {
        const diagnosticCategory: TTypescript.DiagnosticCategory = this._getAdjustedDiagnosticCategory(
          diagnostic,
          ts
        );

        this._printDiagnosticMessage(ts, diagnostic, diagnosticCategory);
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
    switch (diagnostic.code) {
      case ts.Diagnostics.Property_0_has_no_initializer_and_is_not_definitely_assigned_in_the_constructor
        .code:
      case ts.Diagnostics
        .Element_implicitly_has_an_any_type_because_expression_of_type_0_can_t_be_used_to_index_type_1.code:
        return ts.DiagnosticCategory.Warning;
    }

    return diagnostic.category;
  }

  private _emit(
    ts: ExtendedTypeScript,
    genericProgram: TTypescript.BuilderProgram | TTypescript.Program
  ): IExtendedEmitResult {
    const filesToWrite: IFileToWrite[] = [];

    const changedFiles: Set<TTypescript.SourceFile> = new Set();
    EmitFilesPatch.install(ts, genericProgram.getCompilerOptions(), this._moduleKindsToEmit, changedFiles);

    const writeFileCallback: TTypescript.WriteFileCallback = (filePath: string, data: string) => {
      filesToWrite.push({ filePath, data });
    };

    try {
      const result: TTypescript.EmitResult = genericProgram.emit(
        undefined, // Target source file
        writeFileCallback
      );

      return {
        ...result,
        changedSourceFiles: changedFiles,
        filesToWrite
      };
    } finally {
      EmitFilesPatch.uninstall(ts);
    }
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
      this._cachedFileSystem.readFile
    );

    const currentFolder: string = path.dirname(this._configuration.tsconfigPath);
    const tsconfig: TTypescript.ParsedCommandLine = ts.parseJsonConfigFileContent(
      parsedConfigFile.config,
      {
        fileExists: this._cachedFileSystem.exists,
        readFile: this._cachedFileSystem.readFile,
        readDirectory: (
          folderPath: string,
          extensions?: ReadonlyArray<string>,
          excludes?: ReadonlyArray<string>,
          includes?: ReadonlyArray<string>,
          depth?: number
        ) =>
          ts.matchFiles(
            folderPath,
            extensions,
            excludes,
            includes,
            /* useCaseSensitiveFileNames */ true,
            currentFolder,
            depth,
            this._cachedFileSystem.readFolderFilesAndDirectories.bind(this._cachedFileSystem),
            this._cachedFileSystem.getRealPath.bind(this._cachedFileSystem),
            this._cachedFileSystem.directoryExists.bind(this._cachedFileSystem)
          ),
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

  private _buildSolutionBuilderHost(
    tool: ITypeScriptTool,
    reportDiagnostic: TTypescript.DiagnosticReporter
  ): TSolutionHost {
    const reportSolutionBuilderStatus: TTypescript.DiagnosticReporter = reportDiagnostic;
    const reportEmitErrorSummary: TTypescript.ReportEmitErrorSummary = (errorCount: number): void => {
      // Do nothing
    };

    const {
      _moduleKindsToEmit: moduleKindsToEmit,
      _configuration: { emitChangedFilesCallback }
    } = this;

    const { ts } = tool;

    const createMultiEmitProgram: TTypescript.CreateProgram<
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

      if (host) {
        this._changeCompilerHostToUseCache(host, tool);
      }

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

      const { emit: originalEmit } = newProgram;

      if (!compilerOptions) {
        throw new Error(`Expected compilerOptions!`);
      }

      const emit: typeof originalEmit = (
        targetSourceFile?: TTypescript.SourceFile,
        writeFile?: TTypescript.WriteFileCallback,
        cancellationToken?: TTypescript.CancellationToken,
        emitOnlyDtsFiles?: boolean,
        customTransformers?: TTypescript.CustomTransformers
      ) => {
        const changedFiles: Set<TTypescript.SourceFile> = new Set();
        try {
          EmitFilesPatch.install(ts, compilerOptions, moduleKindsToEmit, changedFiles);

          const result: TTypescript.EmitResult = originalEmit.call(
            newProgram,
            targetSourceFile,
            writeFile,
            cancellationToken,
            emitOnlyDtsFiles,
            customTransformers
          );

          this._typescriptTerminal.writeVerboseLine(`Emitting program "${compilerOptions!.configFilePath}"`);

          this._logEmitPerformance(ts);

          // Reset performance counters
          ts.performance.disable();
          ts.performance.enable();

          emitChangedFilesCallback(newProgram.getProgram(), changedFiles);

          return result;
        } finally {
          EmitFilesPatch.uninstall(ts);
        }
      };

      newProgram.emit = emit;

      return newProgram;
    };

    const solutionBuilderHost: TTypescript.SolutionBuilderHost<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram> =
      ts.createSolutionBuilderHost(
        ts.sys,
        createMultiEmitProgram,
        reportDiagnostic,
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
    const { ts } = tool;

    let compilerHost: TTypescript.CompilerHost | undefined;

    if (tsconfig.options.incremental) {
      compilerHost = ts.createIncrementalCompilerHost(tsconfig.options, this._getCachingTypeScriptSystem(ts));
    } else {
      compilerHost = ts.createCompilerHost(tsconfig.options);
    }

    this._changeCompilerHostToUseCache(compilerHost, tool);

    return compilerHost;
  }

  private _changeCompilerHostToUseCache(compilerHost: TTypescript.CompilerHost, tool: ITypeScriptTool): void {
    const { sourceFileCache } = tool;

    const { getSourceFile: innerGetSourceFile } = compilerHost;
    if ((innerGetSourceFile as { cache?: typeof sourceFileCache }).cache === sourceFileCache) {
      return;
    }

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

  private _getCachingTypeScriptSystem(ts: ExtendedTypeScript): TTypescript.System {
    const sys: TTypescript.System = {
      ...ts.sys,
      deleteFile: this._cachedFileSystem.deleteFile.bind(this._cachedFileSystem),
      /** Check if the path exists and is a directory */
      directoryExists: (directoryPath: string) => {
        try {
          const stats: FileSystemStats = this._cachedFileSystem.getStatistics(directoryPath);
          return stats.isDirectory() || stats.isSymbolicLink();
        } catch (error) {
          if (FileSystem.isNotExistError(error as Error)) {
            return false;
          } else {
            throw error;
          }
        }
      },
      /** Check if the path exists and is a file */
      fileExists: (filePath: string) => {
        try {
          const stats: FileSystemStats = this._cachedFileSystem.getStatistics(filePath);
          return stats.isFile();
        } catch (error) {
          if (FileSystem.isNotExistError(error as Error)) {
            return false;
          } else {
            throw error;
          }
        }
      },
      /* Use the Heft config's build folder because it has corrected casing */
      getCurrentDirectory: () => this._configuration.buildFolderPath,
      getDirectories: (folderPath: string) => {
        return this._cachedFileSystem.readFolderFilesAndDirectories(folderPath).directories;
      },
      realpath: this._cachedFileSystem.getRealPath.bind(this._cachedFileSystem)
    };

    return sys;
  }

  // private _buildWatchCompilerHost(
  //   ts: ExtendedTypeScript,
  //   tsconfig: TTypescript.ParsedCommandLine
  // ): TWatchCompilerHost {
  //   const reportDiagnostic: TTypescript.DiagnosticReporter = (diagnostic: TTypescript.Diagnostic): void => {
  //     this._printDiagnosticMessage(ts, diagnostic);
  //   };
  //   const reportWatchStatus: TTypescript.DiagnosticReporter = (diagnostic: TTypescript.Diagnostic) => {
  //     this._printDiagnosticMessage(ts, diagnostic);

  //     // In watch mode, notify EmitCompletedCallbackManager every time we finish recompiling.
  //     if (
  //       diagnostic.code === ts.Diagnostics.Found_0_errors_Watching_for_file_changes.code ||
  //       diagnostic.code === ts.Diagnostics.Found_1_error_Watching_for_file_changes.code
  //     ) {
  //       this._emitCompletedCallbackManager.callback();
  //     }
  //   };

  //   return ts.createWatchCompilerHost(
  //     tsconfig.fileNames,
  //     tsconfig.options,
  //     this._getCachingTypeScriptSystem(ts),
  //     ts.createEmitAndSemanticDiagnosticsBuilderProgram,
  //     reportDiagnostic,
  //     reportWatchStatus,
  //     tsconfig.projectReferences
  //   );
  // }

  // private _buildWatchSolutionBuilderHost(ts: ExtendedTypeScript): TWatchSolutionHost {
  //   const reportDiagnostic: TTypescript.DiagnosticReporter = (diagnostic: TTypescript.Diagnostic): void => {
  //     this._printDiagnosticMessage(ts, diagnostic);
  //   };
  //   const reportSolutionBuilderStatus: TTypescript.DiagnosticReporter = reportDiagnostic;
  //   const reportWatchStatus: TTypescript.DiagnosticReporter = (diagnostic: TTypescript.Diagnostic) => {
  //     this._printDiagnosticMessage(ts, diagnostic);

  //     // In watch mode, notify EmitCompletedCallbackManager every time we finish recompiling.
  //     if (
  //       diagnostic.code === ts.Diagnostics.Found_0_errors_Watching_for_file_changes.code ||
  //       diagnostic.code === ts.Diagnostics.Found_1_error_Watching_for_file_changes.code
  //     ) {
  //       this._emitCompletedCallbackManager.callback();
  //     }
  //   };

  //   return ts.createSolutionBuilderWithWatchHost(
  //     this._getCachingTypeScriptSystem(ts),
  //     ts.createEmitAndSemanticDiagnosticsBuilderProgram,
  //     reportDiagnostic,
  //     reportSolutionBuilderStatus,
  //     reportWatchStatus
  //   );
  // }

  private _overrideTypeScriptReadJson(ts: ExtendedTypeScript): void {
    const cachedReadJson: (filePath: string) => object = (filePath: string) => {
      let jsonData: object | undefined = this._tsReadJsonCache.get(filePath);
      if (jsonData) {
        return jsonData;
      } else {
        try {
          const fileContents: string = this._cachedFileSystem.readFile(filePath);
          if (!fileContents) {
            jsonData = EMPTY_JSON;
          } else {
            const parsedFile: ReturnType<typeof ts.parseConfigFileTextToJson> = ts.parseConfigFileTextToJson(
              filePath,
              fileContents
            );
            if (parsedFile.error) {
              jsonData = EMPTY_JSON;
            } else {
              jsonData = parsedFile.config as object;
            }
          }
        } catch (error) {
          jsonData = EMPTY_JSON;
        }

        this._tsReadJsonCache.set(filePath, jsonData);
        return jsonData;
      }
    };
    ts.readJson = cachedReadJson;
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
}
