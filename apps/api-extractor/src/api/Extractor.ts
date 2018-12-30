// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as ts from 'typescript';
import * as resolve from 'resolve';
import lodash = require('lodash');
import colors = require('colors');

import {
  JsonFile,
  JsonSchema,
  Path,
  FileSystem,
  IPackageJson,
  NewlineKind,
  PackageJsonLookup
} from '@microsoft/node-core-library';
import {
  IExtractorConfig,
  IExtractorProjectConfig,
  IExtractorDtsRollupConfig,
  IExtractorApiJsonFileConfig
} from './IExtractorConfig';
import { ILogger } from './ILogger';
import { Collector } from '../collector/Collector';
import { DtsRollupGenerator, DtsRollupKind } from '../generators/DtsRollupGenerator';
import { MonitoredLogger } from './MonitoredLogger';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';
import { ApiModelGenerator } from '../generators/ApiModelGenerator';
import { ApiPackage } from './model/ApiPackage';
import { ReviewFileGenerator } from '../generators/ReviewFileGenerator';
import { PackageMetadataManager } from '../analyzer/PackageMetadataManager';

/**
 * Options for {@link Extractor.processProject}.
 * @public
 */
export interface IAnalyzeProjectOptions {
  /**
   * If omitted, then the {@link IExtractorConfig.project} config will be used by default.
   */
  projectConfig?: IExtractorProjectConfig;
}

/**
 * Runtime options for Extractor.
 *
 * @public
 */
export interface IExtractorOptions {
  /**
   * If IExtractorConfig.project.configType = 'runtime', then the TypeScript compiler state
   * must be provided via this option.
   */
  compilerProgram?: ts.Program;

  /**
   * Allows the caller to handle API Extractor errors; otherwise, they will be logged
   * to the console.
   */
  customLogger?: Partial<ILogger>;

  /**
   * Indicates that API Extractor is running as part of a local build, e.g. on developer's
   * machine. This disables certain validation that would normally be performed
   * for a ship/production build. For example, the *.api.ts review file is
   * automatically local in a debug build.
   *
   * The default value is false.
   */
  localBuild?: boolean;

  /**
   * By default API Extractor uses its own TypeScript compiler version to analyze your project.
   * This can often cause compiler errors due to incompatibilities between different TS versions.
   * Use this option to specify the folder path for your compiler version.
   *
   * @remarks
   * This option only applies when compiler.config.configType is set to "tsconfig"
   *
   * @beta
   */
  typescriptCompilerFolder?: string;

  /**
   * This option causes the typechecker to be invoked with the --skipLibCheck option. This option is not
   * recommended and may cause API Extractor to produce incomplete or incorrect declarations, but it
   * may be required when dependencies contain declarations that are incompatible with the TypeScript engine
   * that API Extractor uses for its analysis. If this option is used, it is strongly recommended that broken
   * dependencies be fixed or upgraded.
   *
   * @remarks
   * This option only applies when compiler.config.configType is set to "tsconfig"
   */
  skipLibCheck?: boolean;
}

/**
 * Used to invoke the API Extractor tool.
 * @public
 */
export class Extractor {
  /**
   * The JSON Schema for API Extractor config file (api-extractor-config.schema.json).
   */
  public static jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/api-extractor.schema.json'));

  /**
   * Returns the version number of the API Extractor NPM package.
   */
  public static get version(): string {
    return Extractor._getPackageJson().version;
  }

  /**
   * Returns the package name of the API Extractor NPM package.
   */
  public static get packageName(): string {
    return Extractor._getPackageJson().name;
  }

  private static _getPackageJson(): IPackageJson {
    return PackageJsonLookup.loadOwnPackageJson(__dirname);
  }

  private static _defaultConfig: Partial<IExtractorConfig> = JsonFile.load(path.join(__dirname,
    '../schemas/api-extractor-defaults.json'));

  private static _declarationFileExtensionRegExp: RegExp = /\.d\.ts$/i;

  private static _defaultLogger: ILogger = {
    logVerbose: (message: string) => console.log('(Verbose) ' + message),
    logInfo: (message: string) => console.log(message),
    logWarning: (message: string) => console.warn(colors.yellow(message)),
    logError: (message: string) => console.error(colors.red(message))
  };

  private readonly _actualConfig: IExtractorConfig;
  private readonly _program: ts.Program;
  private readonly _localBuild: boolean;
  private readonly _monitoredLogger: MonitoredLogger;
  private readonly _absoluteRootFolder: string;

  /**
   * Given a list of absolute file paths, return a list containing only the declaration
   * files.  Duplicates are also eliminated.
   *
   * @remarks
   * The tsconfig.json settings specify the compiler's input (a set of *.ts source files,
   * plus some *.d.ts declaration files used for legacy typings).  However API Extractor
   * analyzes the compiler's output (a set of *.d.ts entry point files, plus any legacy
   * typings).  This requires API Extractor to generate a special file list when it invokes
   * the compiler.
   *
   * For configType=tsconfig this happens automatically, but for configType=runtime it is
   * the responsibility of the custom tooling.  The generateFilePathsForAnalysis() function
   * is provided to facilitate that.  Duplicates are removed so that entry points can be
   * appended without worrying whether they may already appear in the tsconfig.json file list.
   */
  public static generateFilePathsForAnalysis(inputFilePaths: string[]): string[] {
    const analysisFilePaths: string[] = [];

    const seenFiles: Set<string> = new Set<string>();

    for (const inputFilePath of inputFilePaths) {
      const inputFileToUpper: string = inputFilePath.toUpperCase();
      if (!seenFiles.has(inputFileToUpper)) {
        seenFiles.add(inputFileToUpper);

        if (!path.isAbsolute(inputFilePath)) {
          throw new Error('Input file is not an absolute path: ' + inputFilePath);
        }

        if (Extractor._declarationFileExtensionRegExp.test(inputFilePath)) {
          analysisFilePaths.push(inputFilePath);
        }
      }
    }

    return analysisFilePaths;
  }

  /**
   * Invokes the API Extractor engine, using the api extractor configuration file.
   * @param jsonConfigFile - Path to api extractor json config file.
   * @param options - IExtractor options.
   */
  public static processProjectFromConfigFile(jsonConfigFile: string, options?: IExtractorOptions): void {
    const configObject: IExtractorConfig = this.loadConfigObject(jsonConfigFile);
    const extractor: Extractor = new Extractor(configObject, options);
    extractor.processProject();
  }

  /**
   * Loads the api extractor config file in Extractor Config object.
   * The jsonConfigFile path specified is relative to project directory path.
   * @param jsonConfigFile - Path to api extractor json config file.
   */
  public static loadConfigObject(jsonConfigFile: string): IExtractorConfig {
    // Set to keep track of config files which have been processed.
    const pathSet: Set<string> = new Set<string>();
    // Get absolute path of config file.
    let currentConfigFilePath: string = path.resolve(process.cwd(), jsonConfigFile);
    pathSet.add(currentConfigFilePath);

    const originalConfigFileFolder: string = path.dirname(currentConfigFilePath);

    let extractorConfig: IExtractorConfig = JsonFile.load(jsonConfigFile);

    while (extractorConfig.extends) {
      if (extractorConfig.extends.match(/^\./)) {
        // If extends has relative path.
        // Populate the api extractor config path defined in extends relative to current config path.
        currentConfigFilePath = path.resolve(originalConfigFileFolder, extractorConfig.extends);
      } else {
        // If extends has package path.
        currentConfigFilePath = resolve.sync(
          extractorConfig.extends,
          {
            basedir: originalConfigFileFolder
          }
        );
      }
      // Check if this file was already processed.
      if (pathSet.has(currentConfigFilePath)) {
        throw new Error(`The API Extractor config files contain a cycle. "${currentConfigFilePath}"`
          + ` is included twice.  Please check the "extends" values in config files.`);
      }
      pathSet.add(currentConfigFilePath);

      // Remove extends property from config for current config.
      delete extractorConfig.extends;

      // Load the extractor config defined in extends property.
      const baseConfig: IExtractorConfig = JsonFile.load(currentConfigFilePath);
      lodash.merge(baseConfig, extractorConfig);
      extractorConfig = baseConfig;
    }

    // Validate if the extractor config generated adheres to schema.
    Extractor.jsonSchema.validateObject(extractorConfig, jsonConfigFile);
    return extractorConfig;
  }

  private static _applyConfigDefaults(config: IExtractorConfig): IExtractorConfig {
    // Use the provided config to override the defaults
    const normalized: IExtractorConfig = lodash.merge(
      lodash.cloneDeep(Extractor._defaultConfig), config);

    return normalized;
  }

  public constructor(config: IExtractorConfig, options?: IExtractorOptions) {
    let mergedLogger: ILogger;
    if (options && options.customLogger) {
      mergedLogger = lodash.merge(lodash.clone(Extractor._defaultLogger), options.customLogger);
    } else {
      mergedLogger = Extractor._defaultLogger;
    }
    this._monitoredLogger = new MonitoredLogger(mergedLogger);

    this._actualConfig = Extractor._applyConfigDefaults(config);

    if (!options) {
      options = { };
    }

    this._localBuild = options.localBuild || false;

    switch (this.actualConfig.compiler.configType) {
      case 'tsconfig':
        const rootFolder: string = this.actualConfig.compiler.rootFolder;
        if (!FileSystem.exists(rootFolder)) {
          throw new Error('The root folder does not exist: ' + rootFolder);
        }

        this._absoluteRootFolder = path.normalize(path.resolve(rootFolder));

        let tsconfig: {} | undefined = this.actualConfig.compiler.overrideTsconfig;
        if (!tsconfig) {
          // If it wasn't overridden, then load it from disk
          tsconfig = JsonFile.load(path.join(this._absoluteRootFolder, 'tsconfig.json'));
        }

        const commandLine: ts.ParsedCommandLine = ts.parseJsonConfigFileContent(
          tsconfig,
          ts.sys,
          this._absoluteRootFolder
        );

        if (!commandLine.options.skipLibCheck && options.skipLibCheck) {
          commandLine.options.skipLibCheck = true;
          console.log(colors.cyan(
            'API Extractor was invoked with skipLibCheck. This is not recommended and may cause ' +
            'incorrect type analysis.'
          ));
        }

        this._updateCommandLineForTypescriptPackage(commandLine, options);

        const normalizedEntryPointFile: string = path.normalize(
          path.resolve(this._absoluteRootFolder, this.actualConfig.project.entryPointSourceFile)
        );

        // Append the normalizedEntryPointFile and remove any non-declaration files from the list
        const analysisFilePaths: string[] = Extractor.generateFilePathsForAnalysis(
          commandLine.fileNames.concat(normalizedEntryPointFile)
        );

        this._program = ts.createProgram(analysisFilePaths, commandLine.options);

        if (commandLine.errors.length > 0) {
          const errorText: string = TypeScriptMessageFormatter.format(commandLine.errors[0].messageText);
          throw new Error(`Error parsing tsconfig.json content: ${errorText}`);
        }

        break;

      case 'runtime':
        if (!options.compilerProgram) {
          throw new Error('The compiler.configType=runtime configuration was specified,'
            + ' but the caller did not provide an options.compilerProgram object');
        }

        this._program = options.compilerProgram;
        const rootDir: string | undefined = this._program.getCompilerOptions().rootDir;
        if (!rootDir) {
          throw new Error('The provided compiler state does not specify a root folder');
        }
        if (!FileSystem.exists(rootDir)) {
          throw new Error('The rootDir does not exist: ' + rootDir);
        }
        this._absoluteRootFolder = path.resolve(rootDir);
        break;

      default:
        throw new Error('Unsupported config type');
    }
  }

  /**
   * Returns the normalized configuration object after defaults have been applied.
   *
   * @remarks
   * This is a read-only object.  The caller should NOT modify any member of this object.
   * It is provided for diagnostic purposes.  For example, a build script could write
   * this object to a JSON file to report the final configuration options used by API Extractor.
   */
  public get actualConfig(): IExtractorConfig {
    return this._actualConfig;
  }

  /**
   * Invokes the API Extractor engine, using the configuration that was passed to the constructor.
   * @deprecated Use {@link Extractor.processProject} instead.
   */
  public analyzeProject(options?: IAnalyzeProjectOptions): void {
    this.processProject(options);
  }

  /**
   * Invokes the API Extractor engine, using the configuration that was passed to the constructor.
   * @param options - provides additional runtime state that is NOT part of the API Extractor
   *     config file.
   * @returns true for a successful build, or false if the tool chain should fail the build
   *
   * @remarks
   *
   * This function returns false to indicate that the build failed, i.e. the command-line tool
   * would return a nonzero exit code.  Normally the build fails if there are any errors or
   * warnings; however, if options.localBuild=true then warnings are ignored.
   */
  public processProject(options?: IAnalyzeProjectOptions): boolean {
    this._monitoredLogger.resetCounters();

    if (!options) {
      options = { };
    }

    const projectConfig: IExtractorProjectConfig = options.projectConfig ?
      options.projectConfig : this.actualConfig.project;

    // This helps strict-null-checks to understand that _applyConfigDefaults() eliminated
    // any undefined members
    if (!(this.actualConfig.policies && this.actualConfig.validationRules
      && this.actualConfig.apiJsonFile && this.actualConfig.apiReviewFile
      && this.actualConfig.dtsRollup && this.actualConfig.tsdocMetadata)) {
      throw new Error('The configuration object wasn\'t normalized properly');
    }

    if (!Extractor._declarationFileExtensionRegExp.test(projectConfig.entryPointSourceFile)) {
      throw new Error('The entry point is not a declaration file: ' + projectConfig.entryPointSourceFile);
    }

    const collector: Collector = new Collector({
      program: this._program,
      entryPointFile: path.resolve(this._absoluteRootFolder, projectConfig.entryPointSourceFile),
      logger: this._monitoredLogger,
      policies: this.actualConfig.policies,
      validationRules: this.actualConfig.validationRules
    });

    collector.analyze();

    const modelBuilder: ApiModelGenerator = new ApiModelGenerator(collector);
    const apiPackage: ApiPackage = modelBuilder.buildApiPackage();

    const packageBaseName: string = path.basename(collector.package.name);

    const apiJsonFileConfig: IExtractorApiJsonFileConfig = this.actualConfig.apiJsonFile;

    if (apiJsonFileConfig.enabled) {
      const outputFolder: string = path.resolve(this._absoluteRootFolder, apiJsonFileConfig.outputFolder);

      const apiJsonFilename: string = path.join(outputFolder, packageBaseName + '.api.json');

      this._monitoredLogger.logVerbose('Writing: ' + apiJsonFilename);
      apiPackage.saveToJsonFile(apiJsonFilename, {
        newlineConversion: NewlineKind.CrLf,
        ensureFolderExists: true
      });
    }

    if (this.actualConfig.apiReviewFile.enabled) {
      const apiReviewFilename: string = packageBaseName + '.api.ts';

      const actualApiReviewPath: string = path.resolve(this._absoluteRootFolder,
        this.actualConfig.apiReviewFile.tempFolder, apiReviewFilename);
      const actualApiReviewShortPath: string = this._getShortFilePath(actualApiReviewPath);

      const expectedApiReviewPath: string = path.resolve(this._absoluteRootFolder,
        this.actualConfig.apiReviewFile.apiReviewFolder, apiReviewFilename);
      const expectedApiReviewShortPath: string = this._getShortFilePath(expectedApiReviewPath);

      const actualApiReviewContent: string = ReviewFileGenerator.generateReviewFileContent(collector);

      // Write the actual file
      FileSystem.writeFile(actualApiReviewPath, actualApiReviewContent, {
        ensureFolderExists: true
      });

      // Compare it against the expected file
      if (FileSystem.exists(expectedApiReviewPath)) {
        const expectedApiReviewContent: string = FileSystem.readFile(expectedApiReviewPath);

        if (!ReviewFileGenerator.areEquivalentApiFileContents(actualApiReviewContent, expectedApiReviewContent)) {
          if (!this._localBuild) {
            // For production, issue a warning that will break the CI build.
            this._monitoredLogger.logWarning('You have changed the public API signature for this project.'
              // @microsoft/gulp-core-build seems to run JSON.stringify() on the error messages for some reason,
              // so try to avoid escaped characters:
              + ` Please overwrite ${expectedApiReviewShortPath} with a`
              + ` copy of ${actualApiReviewShortPath}`
              + ' and then request an API review. See the Git repository README.md for more info.');
          } else {
            // For a local build, just copy the file automatically.
            this._monitoredLogger.logWarning('You have changed the public API signature for this project.'
              + ` Updating ${expectedApiReviewShortPath}`);

            FileSystem.writeFile(expectedApiReviewPath, actualApiReviewContent);
          }
        } else {
          this._monitoredLogger.logVerbose(`The API signature is up to date: ${actualApiReviewShortPath}`);
        }
      } else {
        // NOTE: This warning seems like a nuisance, but it has caught genuine mistakes.
        // For example, when projects were moved into category folders, the relative path for
        // the API review files ended up in the wrong place.
        this._monitoredLogger.logError(`The API review file has not been set up.`
          + ` Do this by copying ${actualApiReviewShortPath}`
          + ` to ${expectedApiReviewShortPath} and committing it.`);
      }
    }

    this._generateRollupDtsFiles(collector);

    if (this.actualConfig.tsdocMetadata.enabled) {
      // Write the tsdoc-metadata.json file for this project
      PackageMetadataManager.writeTsdocMetadataFile(
        PackageMetadataManager.resolveTsdocMetadataPath(
          collector.package.packageFolder,
          collector.package.packageJson,
          this.actualConfig.tsdocMetadata.tsdocMetadataPath
        )
      );
    }

    if (this._localBuild) {
      // For a local build, fail if there were errors (but ignore warnings)
      return this._monitoredLogger.errorCount === 0;
    } else {
      // For a production build, fail if there were any errors or warnings
      return (this._monitoredLogger.errorCount + this._monitoredLogger.warningCount) === 0;
    }
  }

  private _generateRollupDtsFiles(collector: Collector): void {
    const packageFolder: string = collector.package.packageFolder;

    const dtsRollup: IExtractorDtsRollupConfig = this.actualConfig.dtsRollup!;
    if (dtsRollup.enabled) {
      let mainDtsRollupPath: string = dtsRollup.mainDtsRollupPath!;

      if (!mainDtsRollupPath) {
        // If the mainDtsRollupPath is not specified, then infer it from the package.json file
        if (!collector.package.packageJson.typings) {
          this._monitoredLogger.logError('Either the "mainDtsRollupPath" setting must be specified,'
            + ' or else the package.json file must contain a "typings" field.');
          return;
        }

        // Resolve the "typings" field relative to package.json itself
        const resolvedTypings: string = path.resolve(packageFolder, collector.package.packageJson.typings);

        if (dtsRollup.trimming) {
          if (!Path.isUnder(resolvedTypings, dtsRollup.publishFolderForInternal!)) {
            this._monitoredLogger.logError('The "mainDtsRollupPath" setting was not specified.'
              + ' In this case, the package.json "typings" field must point to a file under'
              + ' the "publishFolderForInternal": ' + dtsRollup.publishFolderForInternal!);
            return;
          }

          mainDtsRollupPath = path.relative(dtsRollup.publishFolderForInternal!, resolvedTypings);
        } else {
          if (!Path.isUnder(resolvedTypings, dtsRollup.publishFolder!)) {
            this._monitoredLogger.logError('The "mainDtsRollupPath" setting was not specified.'
              + ' In this case, the package.json "typings" field must point to a file under'
              + ' the "publishFolder": ' + dtsRollup.publishFolder!);
            return;
          }

          mainDtsRollupPath = path.relative(dtsRollup.publishFolder!, resolvedTypings);
        }

        this._monitoredLogger.logVerbose(
          `The "mainDtsRollupPath" setting was inferred from package.json: ${mainDtsRollupPath}`
        );
      } else {
        this._monitoredLogger.logVerbose(`The "mainDtsRollupPath" is: ${mainDtsRollupPath}`);

        if (path.isAbsolute(mainDtsRollupPath)) {
          this._monitoredLogger.logError('The "mainDtsRollupPath" setting must be a relative path'
            + ' that can be combined with one of the "publishFolder" settings.');
          return;
        }
      }

      if (dtsRollup.trimming) {
        this._generateRollupDtsFile(collector,
          path.resolve(packageFolder, dtsRollup.publishFolderForPublic!, mainDtsRollupPath),
          DtsRollupKind.PublicRelease);

        this._generateRollupDtsFile(collector,
          path.resolve(packageFolder, dtsRollup.publishFolderForBeta!, mainDtsRollupPath),
          DtsRollupKind.BetaRelease);

        this._generateRollupDtsFile(collector,
          path.resolve(packageFolder, dtsRollup.publishFolderForInternal!, mainDtsRollupPath),
          DtsRollupKind.InternalRelease);
      } else {
        this._generateRollupDtsFile(collector,
          path.resolve(packageFolder, dtsRollup.publishFolder!, mainDtsRollupPath),
          DtsRollupKind.InternalRelease); // (no trimming)
      }
    }
  }

  private _generateRollupDtsFile(collector: Collector, mainDtsRollupFullPath: string,
    dtsKind: DtsRollupKind): void {

    this._monitoredLogger.logVerbose(`Writing package typings: ${mainDtsRollupFullPath}`);

    DtsRollupGenerator.writeTypingsFile(collector, mainDtsRollupFullPath, dtsKind);
  }

  // Returns a simplified file path for use in error messages
  private _getShortFilePath(absolutePath: string): string {
    if (!path.isAbsolute(absolutePath)) {
      throw new Error('Expected absolute path: ' + absolutePath);
    }
    return path.relative(this._absoluteRootFolder, absolutePath).replace(/\\/g, '/');
  }

  /**
   * Update the parsed command line to use paths from the specified TS compiler folder, if
   * a TS compiler folder is specified.
   */
  private _updateCommandLineForTypescriptPackage(
    commandLine: ts.ParsedCommandLine,
    options: IExtractorOptions
  ): void {
    const DEFAULT_BUILTIN_LIBRARY: string = 'lib.d.ts';
    const OTHER_BUILTIN_LIBRARIES: string[] = ['lib.es5.d.ts', 'lib.es6.d.ts'];

    if (options.typescriptCompilerFolder) {
      commandLine.options.noLib = true;
      const compilerLibFolder: string = path.join(options.typescriptCompilerFolder, 'lib');

      let foundBaseLib: boolean = false;
      const filesToAdd: string[] = [];
      for (const libFilename of commandLine.options.lib || []) {
        if (libFilename === DEFAULT_BUILTIN_LIBRARY) {
          // Ignore the default lib - it'll get added later
          continue;
        }

        if (OTHER_BUILTIN_LIBRARIES.indexOf(libFilename) !== -1) {
          foundBaseLib = true;
        }

        const libPath: string = path.join(compilerLibFolder, libFilename);
        if (!FileSystem.exists(libPath)) {
          throw new Error(`lib ${libFilename} does not exist in the compiler specified in typescriptLibPackage`);
        }

        filesToAdd.push(libPath);
      }

      if (!foundBaseLib) {
        // If we didn't find another version of the base lib library, include the default
        filesToAdd.push(path.join(compilerLibFolder, 'lib.d.ts'));
      }

      if (!commandLine.fileNames) {
        commandLine.fileNames = [];
      }

      commandLine.fileNames.push(...filesToAdd);

      commandLine.options.lib = undefined;
    }
  }
}
