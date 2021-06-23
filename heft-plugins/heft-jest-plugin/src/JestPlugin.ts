// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Load the Jest patch
import './jestWorkerPatch';

import * as path from 'path';
import { mergeWith, isObject } from 'lodash';
import type {
  ICleanStageContext,
  IBuildStageContext,
  IBuildStageProperties,
  IPostBuildSubstage,
  ITestStageContext,
  ITestStageProperties,
  IHeftPlugin,
  HeftConfiguration,
  HeftSession,
  ScopedLogger
} from '@rushstack/heft';
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
import { HeftJestDataFile } from './HeftJestDataFile';

type JestReporterConfig = string | Config.ReporterConfig;
const PLUGIN_NAME: string = 'JestPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-jest-plugin.schema.json`;
const JEST_CONFIGURATION_LOCATION: string = `config/jest.config.json`;

export interface IJestPluginOptions {
  disableConfigurationModuleResolution?: boolean;
  configurationPath?: string;
}

export interface IHeftJestConfiguration extends Config.InitialOptions {}

/**
 * @internal
 */
export class JestPlugin implements IHeftPlugin<IJestPluginOptions> {
  public readonly pluginName: string = PLUGIN_NAME;
  public readonly optionsSchema: JsonSchema = JsonSchema.fromFile(PLUGIN_SCHEMA_PATH);

  private static _ownPackageFolder: string = path.resolve(__dirname, '..');

  /**
   * Runs required setup before running Jest through the JestPlugin.
   */
  public static async _setupJestAsync(
    scopedLogger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    debugMode: boolean,
    buildStageProperties: IBuildStageProperties,
    options?: IJestPluginOptions
  ): Promise<void> {
    // Write the data file used by jest-build-transform
    await HeftJestDataFile.saveForProjectAsync(heftConfiguration.buildFolder, {
      emitFolderNameForTests: buildStageProperties.emitFolderNameForTests || 'lib',
      extensionForTests: buildStageProperties.emitExtensionForTests || '.js',
      skipTimestampCheck: !buildStageProperties.watchMode,
      // If the property isn't defined, assume it's a not a TypeScript project since this
      // value should be set by the Heft TypeScriptPlugin during the compile hook
      isTypeScriptProject: !!buildStageProperties.isTypeScriptProject
    });
    scopedLogger.terminal.writeLine('Wrote heft-jest-config.json file');
  }

  /**
   * Runs Jest using the provided options.
   */
  public static async _runJestAsync(
    scopedLogger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    debugMode: boolean,
    testStageProperties: ITestStageProperties,
    options?: IJestPluginOptions
  ): Promise<void> {
    const terminal: Terminal = scopedLogger.terminal;
    terminal.writeLine(`Using Jest version ${getVersion()}`);

    const buildFolder: string = heftConfiguration.buildFolder;
    const projectRelativeFilePath: string = options?.configurationPath ?? JEST_CONFIGURATION_LOCATION;
    await HeftJestDataFile.loadAndValidateForProjectAsync(buildFolder);

    let jestConfig: IHeftJestConfiguration;
    if (options?.disableConfigurationModuleResolution) {
      // Module resolution explicitly disabled, use the config as-is
      const jestConfigPath: string = path.join(buildFolder, projectRelativeFilePath);
      if (!(await FileSystem.existsAsync(jestConfigPath))) {
        scopedLogger.emitError(new Error(`Expected to find jest config file at "${jestConfigPath}".`));
        return;
      }
      jestConfig = await JsonFile.loadAsync(jestConfigPath);
    } else {
      // Load in and resolve the config file using the "extends" field
      jestConfig = await JestPlugin._getJestConfigurationLoader(
        buildFolder,
        projectRelativeFilePath
      ).loadConfigurationFileForProjectAsync(
        terminal,
        heftConfiguration.buildFolder,
        heftConfiguration.rigConfig
      );
      if (jestConfig.preset) {
        throw new Error(
          'The provided jest.config.json specifies a "preset" property while using resolved modules. ' +
            'You must either remove all "preset" values from your Jest configuration, use the "extends" ' +
            'property, or set the "disableConfigurationModuleResolution" option to "true" on the Jest ' +
            'plugin in heft.json'
        );
      }
    }

    const jestArgv: Config.Argv = {
      watch: testStageProperties.watchMode,

      // In debug mode, avoid forking separate processes that are difficult to debug
      runInBand: debugMode,
      debug: debugMode,
      detectOpenHandles: !!testStageProperties.detectOpenHandles,

      cacheDirectory: JestPlugin._getJestCacheFolder(heftConfiguration),
      updateSnapshot: testStageProperties.updateSnapshots,

      listTests: false,
      rootDir: buildFolder,

      silent: testStageProperties.silent,
      testNamePattern: testStageProperties.testNamePattern,
      testPathPattern: testStageProperties.testPathPattern
        ? [...testStageProperties.testPathPattern]
        : undefined,
      testTimeout: testStageProperties.testTimeout,
      maxWorkers: testStageProperties.maxWorkers,

      passWithNoTests: testStageProperties.passWithNoTests,

      $0: process.argv0,
      _: []
    };

    if (!testStageProperties.debugHeftReporter) {
      // Extract the reporters and transform to include the Heft reporter by default
      jestArgv.reporters = JestPlugin._extractHeftJestReporters(
        scopedLogger,
        heftConfiguration,
        debugMode,
        jestConfig,
        projectRelativeFilePath
      );
    } else {
      scopedLogger.emitWarning(
        new Error('The "--debug-heft-reporter" parameter was specified; disabling HeftJestReporter')
      );
    }

    if (testStageProperties.findRelatedTests && testStageProperties.findRelatedTests.length > 0) {
      // Pass test names as the command line remainder
      jestArgv.findRelatedTests = true;
      jestArgv._ = [...testStageProperties.findRelatedTests];
    }

    // Stringify the config and pass it into Jest directly
    jestArgv.config = JSON.stringify(jestConfig);

    const {
      // Config.Argv is weakly typed.  After updating the jestArgv object, it's a good idea to inspect "globalConfig"
      // in the debugger to validate that your changes are being applied as expected.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      globalConfig,
      results: jestResults
    } = await runCLI(jestArgv, [buildFolder]);

    if (jestResults.numFailedTests > 0) {
      scopedLogger.emitError(
        new Error(
          `${jestResults.numFailedTests} Jest test${jestResults.numFailedTests > 1 ? 's' : ''} failed`
        )
      );
    } else if (jestResults.numFailedTestSuites > 0) {
      scopedLogger.emitError(
        new Error(
          `${jestResults.numFailedTestSuites} Jest test suite${
            jestResults.numFailedTestSuites > 1 ? 's' : ''
          } failed`
        )
      );
    }
  }

  /**
   * Returns the loader for the `config/api-extractor-task.json` config file.
   */
  public static _getJestConfigurationLoader(
    buildFolder: string,
    projectRelativeFilePath: string
  ): ConfigurationFile<IHeftJestConfiguration> {
    // Bypass Jest configuration validation
    const schemaPath: string = `${__dirname}/schemas/anything.schema.json`;

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
      return mergeWith(parentObject || {}, currentObject || {}, (value: any, source: any) => {
        if (!isObject(source)) {
          return source;
        }
        return Array.isArray(value) ? [...value, ...source] : { ...value, ...source };
      });
    };

    // Resolve all specified properties using Node resolution, and replace <rootDir> with the same rootDir
    // that we provide to Jest. Resolve if we modified since paths containing <rootDir> should be absolute.
    const nodeResolveMetadata: IJsonPathMetadata = {
      preresolve: (jsonPath: string) => {
        // Compare with replaceRootDirInPath() from here:
        // https://github.com/facebook/jest/blob/5f4dd187d89070d07617444186684c20d9213031/packages/jest-config/src/utils.ts#L58
        const ROOTDIR_TOKEN: string = '<rootDir>';

        // Example:  <rootDir>/path/to/file.js
        if (jsonPath.startsWith(ROOTDIR_TOKEN)) {
          const restOfPath: string = path.normalize('./' + jsonPath.substr(ROOTDIR_TOKEN.length));
          return path.resolve(buildFolder, restOfPath);
        }

        // The normal PathResolutionMethod.NodeResolve will generally not be able to find @rushstack/heft-jest-plugin
        // from a project that is using a rig.  Since it is important, and it is our own package, we resolve it
        // manually as a special case.
        const PLUGIN_PACKAGE_NAME: string = '@rushstack/heft-jest-plugin';

        // Example:  @rushstack/heft-jest-plugin
        if (jsonPath === PLUGIN_PACKAGE_NAME) {
          return JestPlugin._ownPackageFolder;
        }

        // Example:  @rushstack/heft-jest-plugin/path/to/file.js
        if (jsonPath.startsWith(PLUGIN_PACKAGE_NAME)) {
          const restOfPath: string = path.normalize('./' + jsonPath.substr(PLUGIN_PACKAGE_NAME.length));
          return path.join(JestPlugin._ownPackageFolder, restOfPath);
        }

        return jsonPath;
      },
      pathResolutionMethod: PathResolutionMethod.NodeResolve
    };

    return new ConfigurationFile<IHeftJestConfiguration>({
      projectRelativeFilePath: projectRelativeFilePath,
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
        '$.filter': nodeResolveMetadata,
        '$.globalSetup': nodeResolveMetadata,
        '$.globalTeardown': nodeResolveMetadata,
        '$.moduleLoader': nodeResolveMetadata,
        '$.prettierPath': nodeResolveMetadata,
        '$.resolver': nodeResolveMetadata,
        '$.runner': nodeResolveMetadata,
        '$.snapshotResolver': nodeResolveMetadata,
        // This is a name like "jsdom" that gets mapped into a package name like "jest-environment-jsdom"
        // '$.testEnvironment': string
        '$.testResultsProcessor': nodeResolveMetadata,
        '$.testRunner': nodeResolveMetadata,
        '$.testSequencer': nodeResolveMetadata,
        // string[]
        '$.setupFiles.*': nodeResolveMetadata,
        '$.setupFilesAfterEnv.*': nodeResolveMetadata,
        '$.snapshotSerializers.*': nodeResolveMetadata,
        // reporters: (path | [ path, options ])[]
        '$.reporters[?(@ !== "default")]*@string()': nodeResolveMetadata, // string path, excluding "default"
        '$.reporters.*[?(@property == 0 && @ !== "default")]': nodeResolveMetadata, // First entry in [ path, options ], excluding "default"
        // transform: { [regex]: path | [ path, options ] }
        '$.transform.*@string()': nodeResolveMetadata, // string path
        '$.transform.*[?(@property == 0)]': nodeResolveMetadata, // First entry in [ path, options ]
        // watchPlugins: (path | [ path, options ])[]
        '$.watchPlugins.*@string()': nodeResolveMetadata, // string path
        '$.watchPlugins.*[?(@property == 0)]': nodeResolveMetadata // First entry in [ path, options ]
      }
    });
  }

  private static _extractHeftJestReporters(
    scopedLogger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    debugMode: boolean,
    config: IHeftJestConfiguration,
    projectRelativeFilePath: string
  ): JestReporterConfig[] {
    let isUsingHeftReporter: boolean = false;

    const reporterOptions: IHeftJestReporterOptions = {
      heftConfiguration,
      debugMode
    };
    if (Array.isArray(config.reporters)) {
      // Harvest all the array indices that need to modified before altering the array
      const heftReporterIndices: number[] = JestPlugin._findIndexes(config.reporters, 'default');

      // Replace 'default' reporter with the heft reporter
      // This may clobber default reporters options
      if (heftReporterIndices.length > 0) {
        const heftReporter: Config.ReporterConfig = JestPlugin._getHeftJestReporterConfig(reporterOptions);
        for (const index of heftReporterIndices) {
          config.reporters[index] = heftReporter;
        }
        isUsingHeftReporter = true;
      }
    } else if (typeof config.reporters === 'undefined' || config.reporters === null) {
      // Otherwise if no reporters are specified install only the heft reporter
      config.reporters = [JestPlugin._getHeftJestReporterConfig(reporterOptions)];
      isUsingHeftReporter = true;
    } else {
      // Making a note if Heft cannot understand the reporter entry in Jest config
      // Not making this an error or warning because it does not warrant blocking a dev or CI test pass
      // If the Jest config is truly wrong Jest itself is in a better position to report what is wrong with the config
      scopedLogger.terminal.writeVerboseLine(
        `The 'reporters' entry in Jest config '${projectRelativeFilePath}' is in an unexpected format. Was ` +
          'expecting an array of reporters'
      );
    }

    if (!isUsingHeftReporter) {
      scopedLogger.terminal.writeVerboseLine(
        `HeftJestReporter was not specified in Jest config '${projectRelativeFilePath}'. Consider adding a ` +
          "'default' entry in the reporters array."
      );
    }

    // Since we're injecting the HeftConfiguration, we need to pass these args directly and not through serialization
    const reporters: JestReporterConfig[] = config.reporters;
    config.reporters = undefined;
    return reporters;
  }

  /**
   * Returns the reporter config using the HeftJestReporter and the provided options.
   */
  private static _getHeftJestReporterConfig(
    reporterOptions: IHeftJestReporterOptions
  ): Config.ReporterConfig {
    return [
      `${__dirname}/HeftJestReporter.js`,
      reporterOptions as Record<keyof IHeftJestReporterOptions, unknown>
    ];
  }

  /**
   * Finds the indices of jest reporters with a given name
   */
  private static _findIndexes(items: JestReporterConfig[], search: string): number[] {
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

  /**
   * Add the jest-cache folder to the list of paths to delete when running the "clean" stage.
   */
  private static _includeJestCacheWhenCleaning(
    heftConfiguration: HeftConfiguration,
    clean: ICleanStageContext
  ): void {
    // Jest's cache is not reliable.  For example, if a Jest configuration change causes files to be
    // transformed differently, the cache will continue to return the old results unless we manually
    // clean it.  Thus we need to ensure that "heft clean" always cleans the Jest cache.
    const cacheFolder: string = JestPlugin._getJestCacheFolder(heftConfiguration);
    clean.properties.pathsToDelete.add(cacheFolder);
  }

  /**
   * Returns the absolute path to the jest-cache directory.
   */
  private static _getJestCacheFolder(heftConfiguration: HeftConfiguration): string {
    return path.join(heftConfiguration.buildCacheFolder, 'jest-cache');
  }

  public apply(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    options?: IJestPluginOptions
  ): void {
    const scopedLogger: ScopedLogger = heftSession.requestScopedLogger('jest');

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.postBuild.tap(PLUGIN_NAME, (postBuild: IPostBuildSubstage) => {
        postBuild.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await JestPlugin._setupJestAsync(
            scopedLogger,
            heftConfiguration,
            heftSession.debugMode,
            build.properties,
            options
          );
        });
      });
    });

    heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestStageContext) => {
      test.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        await JestPlugin._runJestAsync(
          scopedLogger,
          heftConfiguration,
          heftSession.debugMode,
          test.properties,
          options
        );
      });
    });

    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      JestPlugin._includeJestCacheWhenCleaning(heftConfiguration, clean);
    });
  }
}
