// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Load the Jest patch
import './jestWorkerPatch';

import * as path from 'path';
import * as lodash from 'lodash';
import { getVersion, runCLI } from '@jest/core';
import { Config } from '@jest/types';
import {
  ConfigurationFile,
  IJsonPathMetadata,
  InheritanceType,
  PathResolutionMethod
} from '@rushstack/heft-config-file';
import { FileSystem, JsonFile, JsonSchema, Terminal } from '@rushstack/node-core-library';

import { IHeftJestReporterOptions } from './HeftJestReporter';
import { JestTypeScriptDataFile, IJestTypeScriptDataFileJson } from './JestTypeScriptDataFile';

import type {
  ICleanStageContext,
  ITestStageContext,
  IHeftPlugin,
  HeftConfiguration,
  HeftSession,
  ScopedLogger,
  IBuildStageContext,
  ICompileSubstage
} from '@rushstack/heft';

type JestReporterConfig = string | Config.ReporterConfig;
const PLUGIN_NAME: string = 'JestPlugin';
const SCHEMA_PATH: string = path.join(__dirname, 'schemas', 'heft-jest-plugin.schema.json');
const JEST_CONFIGURATION_LOCATION: string = path.join('config', 'jest.config.json');

interface IJestPluginOptions {
  resolveConfigurationModules?: boolean;
  passWithNoTests?: boolean;
}

export interface IHeftJestConfiguration extends Config.InitialOptions {}

/**
 * @internal
 */
export class JestPlugin implements IHeftPlugin<IJestPluginOptions> {
  public readonly pluginName: string = PLUGIN_NAME;
  public readonly optionsSchemaFilePath: string = SCHEMA_PATH;

  private _jestTerminal!: Terminal;

  /**
   * Returns the loader for the `config/api-extractor-task.json` config file.
   */
  public static getJestConfigurationLoader(rootDir: string): ConfigurationFile<IHeftJestConfiguration> {
    // Bypass Jest configuration validation
    const schemaPath: string = path.resolve(__dirname, 'schemas', 'anything.schema.json');

    // By default, ConfigurationFile will replace all objects, so we need to provide merge functions for these
    const shallowObjectInheritanceFunc: <T>(
      currentObject: T,
      parentObject: T
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => T = <T extends { [key: string]: any }>(currentObject: T, parentObject: T): T => {
      return { ...(parentObject || {}), ...(currentObject || {}) };
    };
    const deepObjectInheritanceFunc: <T>(
      currentObject: T,
      parentObject: T
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => T = <T extends { [key: string]: any }>(currentObject: T, parentObject: T): T => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return lodash.mergeWith(parentObject || {}, currentObject || {}, (value: any, source: any) => {
        if (!lodash.isObject(source)) {
          return source;
        }
        return Array.isArray(value) ? [...value, ...source] : { ...value, ...source };
      });
    };

    // Resolve all specified properties using Node resolution, and replace <rootDir> with the same rootDir
    // that we provide to Jest. Resolve if we modified since paths containing <rootDir> should be absolute.
    const nodeResolveMetadata: IJsonPathMetadata = {
      preresolve: (jsonPath: string) => {
        const newJsonPath: string = jsonPath.replace(/<rootDir>/g, rootDir);
        return jsonPath === newJsonPath ? jsonPath : path.resolve(newJsonPath);
      },
      pathResolutionMethod: PathResolutionMethod.NodeResolve
    };

    return new ConfigurationFile<IHeftJestConfiguration>({
      projectRelativeFilePath: 'config/jest.config.json',
      jsonSchemaPath: schemaPath,
      propertyInheritance: {
        moduleNameMapper: {
          inheritanceType: InheritanceType.custom,
          inheritanceFunction: shallowObjectInheritanceFunc
        },
        transform: {
          inheritanceType: InheritanceType.custom,
          inheritanceFunction: shallowObjectInheritanceFunc
        },
        globals: {
          inheritanceType: InheritanceType.custom,
          inheritanceFunction: deepObjectInheritanceFunc
        }
      },
      jsonPathMetadata: {
        // string
        '$.dependencyExtractor': nodeResolveMetadata,
        '$.globalSetup': nodeResolveMetadata,
        '$.globalTeardown': nodeResolveMetadata,
        '$.moduleLoader': nodeResolveMetadata,
        '$.snapshotResolver': nodeResolveMetadata,
        '$.testResultsProcessor': nodeResolveMetadata,
        '$.testRunner': nodeResolveMetadata,
        '$.filter': nodeResolveMetadata,
        '$.runner': nodeResolveMetadata,
        '$.prettierPath': nodeResolveMetadata,
        '$.resolver': nodeResolveMetadata,
        // string[]
        '$.setupFiles.*': nodeResolveMetadata,
        '$.setupFilesAfterEnv.*': nodeResolveMetadata,
        '$.snapshotSerializers.*': nodeResolveMetadata,
        // reporters: (path | [ path, options ])[]
        '$.reporters[?(@ !== "default")]*@string()': nodeResolveMetadata, // string path, excluding "default"
        '$.reporters.*[?(@property == 0 && @ !== "default")]': nodeResolveMetadata, // First entry in [ path, options ], excluding "default"
        // watchPlugins: (path | [ path, options ])[]
        '$.watchPlugins.*@string()': nodeResolveMetadata, // string path
        '$.watchPlugins.*[?(@property == 0)]': nodeResolveMetadata, // First entry in [ path, options ]
        // transform: { [regex]: path | [ path, options ] }
        '$.transform.*@string()': nodeResolveMetadata, // string path
        '$.transform.*[?(@property == 0)]': nodeResolveMetadata // First entry in [ path, options ]
      }
    });
  }

  public apply(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    options?: IJestPluginOptions
  ): void {
    // TODO: Remove when newer version of Heft consumed
    if (options) {
      JsonSchema.fromFile(SCHEMA_PATH).validateObject(options, 'config/heft.json');
    }

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.afterCompile.tapPromise(PLUGIN_NAME, async () => {
          // Write the data file used by jest-build-transform
          if (build.properties.isTypeScriptProject) {
            await JestTypeScriptDataFile.saveForProjectAsync(heftConfiguration.buildFolder, {
              emitFolderNameForTests: build.properties.emitFolderNameForTests || 'lib',
              extensionForTests: build.properties.emitExtensionForTests || '.js',
              skipTimestampCheck: !build.properties.watchMode
            });
          }
        });
      });
    });

    heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestStageContext) => {
      test.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        await this._runJestAsync(heftSession, heftConfiguration, test, options);
      });
    });

    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      this._includeJestCacheWhenCleaning(heftConfiguration, clean);
    });
  }

  private async _runJestAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    test: ITestStageContext,
    options?: IJestPluginOptions
  ): Promise<void> {
    const jestLogger: ScopedLogger = heftSession.requestScopedLogger('jest');
    const buildFolder: string = heftConfiguration.buildFolder;

    this._jestTerminal = jestLogger.terminal;
    this._jestTerminal.writeLine(`Using Jest version ${getVersion()}`);

    // In watch mode, Jest starts up in parallel with the compiler, so there's no
    // guarantee that the output files would have been written yet.
    if (!test.properties.watchMode) {
      this._validateJestTypeScriptDataFile(buildFolder);
    }

    let jestConfig: string;
    if (options?.resolveConfigurationModules === false) {
      // Module resolution explicitly disabled, use the config as-is
      jestConfig = this._getJestConfigPath(heftConfiguration);
      if (!FileSystem.exists(jestConfig)) {
        jestLogger.emitError(new Error(`Expected to find jest config file at "${jestConfig}".`));
        return;
      }
    } else {
      // Load in and resolve the config file using the "extends" field
      const jestConfigObj: IHeftJestConfiguration = await JestPlugin.getJestConfigurationLoader(
        heftConfiguration.buildFolder
      ).loadConfigurationFileForProjectAsync(
        this._jestTerminal,
        heftConfiguration.buildFolder,
        heftConfiguration.rigConfig
      );
      if (jestConfigObj.preset) {
        throw new Error(
          'The provided jest.config.json specifies a "preset" property while using resolved modules. ' +
            'You must either remove all "preset" values from your Jest configuration, use the "extends" ' +
            'property, or disable the "resolveConfigurationModules" option on the Jest plugin in heft.json'
        );
      }
      jestConfig = JSON.stringify(jestConfigObj);
    }

    const jestArgv: Config.Argv = {
      watch: test.properties.watchMode,

      // In debug mode, avoid forking separate processes that are difficult to debug
      runInBand: heftSession.debugMode,
      debug: heftSession.debugMode,
      detectOpenHandles: !!test.properties.detectOpenHandles,

      // Jest config being passed in can be either a serialized JSON string or a path to the config
      config: jestConfig,
      cacheDirectory: this._getJestCacheFolder(heftConfiguration),
      updateSnapshot: test.properties.updateSnapshots,

      listTests: false,
      rootDir: buildFolder,

      silent: test.properties.silent,
      testNamePattern: test.properties.testNamePattern,
      testPathPattern: test.properties.testPathPattern ? [...test.properties.testPathPattern] : undefined,
      testTimeout: test.properties.testTimeout,
      maxWorkers: test.properties.maxWorkers,

      passWithNoTests: options?.passWithNoTests,

      $0: process.argv0,
      _: []
    };

    if (!test.properties.debugHeftReporter) {
      jestArgv.reporters = await this._getJestReporters(heftSession, heftConfiguration, jestLogger);
    } else {
      jestLogger.emitWarning(
        new Error('The "--debug-heft-reporter" parameter was specified; disabling HeftJestReporter')
      );
    }

    if (test.properties.findRelatedTests && test.properties.findRelatedTests.length > 0) {
      jestArgv.findRelatedTests = true;
      // Pass test names as the command line remainder
      jestArgv._ = [...test.properties.findRelatedTests];
    }

    const {
      // Config.Argv is weakly typed.  After updating the jestArgv object, it's a good idea to inspect "globalConfig"
      // in the debugger to validate that your changes are being applied as expected.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      globalConfig,
      results: jestResults
    } = await runCLI(jestArgv, [buildFolder]);

    if (jestResults.numFailedTests > 0) {
      jestLogger.emitError(
        new Error(
          `${jestResults.numFailedTests} Jest test${jestResults.numFailedTests > 1 ? 's' : ''} failed`
        )
      );
    } else if (jestResults.numFailedTestSuites > 0) {
      jestLogger.emitError(
        new Error(
          `${jestResults.numFailedTestSuites} Jest test suite${
            jestResults.numFailedTestSuites > 1 ? 's' : ''
          } failed`
        )
      );
    }
  }

  private _validateJestTypeScriptDataFile(buildFolder: string): void {
    // We have no gurantee that the data file exists, since this would only get written
    // during the build stage when running in a TypeScript project
    let jestTypeScriptDataFile: IJestTypeScriptDataFileJson | undefined;
    try {
      jestTypeScriptDataFile = JestTypeScriptDataFile.loadForProject(buildFolder);
    } catch (error) {
      if (!FileSystem.isNotExistError(error)) {
        throw error;
      }
    }
    if (jestTypeScriptDataFile) {
      const emitFolderPathForJest: string = path.join(
        buildFolder,
        jestTypeScriptDataFile.emitFolderNameForTests
      );
      if (!FileSystem.exists(emitFolderPathForJest)) {
        throw new Error(
          'The transpiler output folder does not exist:\n  ' +
            emitFolderPathForJest +
            '\nWas the compiler invoked? Is the "emitFolderNameForTests" setting correctly' +
            ' specified in config/typescript.json?\n'
        );
      }
    }
  }

  private _includeJestCacheWhenCleaning(
    heftConfiguration: HeftConfiguration,
    clean: ICleanStageContext
  ): void {
    // Jest's cache is not reliable.  For example, if a Jest configuration change causes files to be
    // transformed differently, the cache will continue to return the old results unless we manually
    // clean it.  Thus we need to ensure that "heft clean" always cleans the Jest cache.
    const cacheFolder: string = this._getJestCacheFolder(heftConfiguration);
    clean.properties.pathsToDelete.add(cacheFolder);
  }

  private async _getJestReporters(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    jestLogger: ScopedLogger
  ): Promise<JestReporterConfig[]> {
    const config: Config.GlobalConfig = await JsonFile.loadAsync(this._getJestConfigPath(heftConfiguration));
    let reporters: JestReporterConfig[];
    let isUsingHeftReporter: boolean = false;
    let parsedConfig: boolean = false;

    if (Array.isArray(config.reporters)) {
      reporters = config.reporters;

      // Harvest all the array indices that need to modified before altering the array
      const heftReporterIndices: number[] = this._findIndexes(config.reporters, 'default');

      // Replace 'default' reporter with the heft reporter
      // This may clobber default reporters options
      if (heftReporterIndices.length > 0) {
        const heftReporter: Config.ReporterConfig = this._getHeftJestReporterConfig(
          heftSession,
          heftConfiguration
        );

        for (const index of heftReporterIndices) {
          reporters[index] = heftReporter;
        }
        isUsingHeftReporter = true;
      }

      parsedConfig = true;
    } else if (typeof config.reporters === 'undefined' || config.reporters === null) {
      // Otherwise if no reporters are specified install only the heft reporter
      reporters = [this._getHeftJestReporterConfig(heftSession, heftConfiguration)];
      isUsingHeftReporter = true;
      parsedConfig = true;
    } else {
      // The reporters config is in a format Heft does not support, leave it as is but complain about it
      reporters = config.reporters;
    }

    if (!parsedConfig) {
      // Making a note if Heft cannot understand the reporter entry in Jest config
      // Not making this an error or warning because it does not warrant blocking a dev or CI test pass
      // If the Jest config is truly wrong Jest itself is in a better position to report what is wrong with the config
      jestLogger.terminal.writeVerboseLine(
        `The 'reporters' entry in Jest config '${JEST_CONFIGURATION_LOCATION}' is in an unexpected format. Was expecting an array of reporters`
      );
    }

    if (!isUsingHeftReporter) {
      jestLogger.terminal.writeVerboseLine(
        `HeftJestReporter was not specified in Jest config '${JEST_CONFIGURATION_LOCATION}'. Consider adding a 'default' entry in the reporters array.`
      );
    }

    return reporters;
  }

  private _getHeftJestReporterConfig(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Config.ReporterConfig {
    const reporterOptions: IHeftJestReporterOptions = {
      heftConfiguration,
      debugMode: heftSession.debugMode
    };

    return [
      path.resolve(__dirname, 'HeftJestReporter.js'),
      reporterOptions as Record<keyof IHeftJestReporterOptions, unknown>
    ];
  }

  private _getJestConfigPath(heftConfiguration: HeftConfiguration): string {
    return path.join(heftConfiguration.buildFolder, JEST_CONFIGURATION_LOCATION);
  }

  private _getJestCacheFolder(heftConfiguration: HeftConfiguration): string {
    return path.join(heftConfiguration.buildCacheFolder, 'jest-cache');
  }

  // Finds the indices of jest reporters with a given name
  private _findIndexes(items: JestReporterConfig[], search: string): number[] {
    const result: number[] = [];

    for (let index: number = 0; index < items.length; index++) {
      const item: JestReporterConfig = items[index];

      // Item is either a string or a tuple of [reporterName: string, options: unknown]
      if (item === search) {
        result.push(index);
      } else if (typeof item !== 'undefined' && item !== null && item[0] === search) {
        result.push(index);
      }
    }

    return result;
  }
}
