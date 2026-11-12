// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Load the Jest patches before anything else loads
import './patches/jestWorkerPatch';

import type { Dirent } from 'node:fs';
import * as path from 'node:path';

import type { Config } from '@jest/types';
import { resolveRunner, resolveSequencer, resolveTestEnvironment, resolveWatchPlugin } from 'jest-resolve';

import type {
  HeftConfiguration,
  IScopedLogger,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter
} from '@rushstack/heft';
import {
  ProjectConfigurationFile,
  type ICustomJsonPathMetadata,
  type IJsonPathMetadataResolverOptions,
  InheritanceType,
  PathResolutionMethod
} from '@rushstack/heft-config-file';
import { FileSystem, Path, Import, JsonFile, Objects, PackageName } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { IHeftJestReporterOptions } from './HeftJestReporter';
import { jestResolve } from './JestUtils';
import anythingSchema from './schemas/anything.schema.json';

type JestReporterConfig = string | Config.ReporterConfig;

/**
 * Options to use when performing resolution for paths and modules specified in the Jest
 * configuration.
 */
interface IJestResolutionOptions {
  /**
   * The value that will be substituted for <rootDir> tokens.
   */
  rootDir: string;
  /**
   * Whether the value should be resolved as a module relative to the configuration file after
   * substituting special tokens.
   */
  resolveAsModule?: boolean;
}

/**
 * Options that can be provided to the plugin.
 */
export interface IJestPluginOptions {
  configurationPath?: string;
  debugHeftReporter?: boolean;
  detectOpenHandles?: boolean;
  disableCodeCoverage?: boolean;
  disableConfigurationModuleResolution?: boolean;
  enableNodeEnvManagement?: boolean;
  findRelatedTests?: string[];
  maxWorkers?: string;
  passWithNoTests?: boolean;
  silent?: boolean;
  testNamePattern?: string;
  testPathIgnorePatterns?: string;
  testPathPattern?: string;
  testTimeout?: number;
  updateSnapshots?: boolean;
  logHeapUsage?: boolean;
}

export interface IHeftJestConfiguration extends Config.InitialOptions {}

interface IHeftJestConfigurationWithExtends extends IHeftJestConfiguration {
  extends?: string;
}

interface IExtendedHeftJestConfiguration extends IHeftJestConfiguration {
  extends: string | undefined;
}

const PLUGIN_NAME: 'jest-plugin' = 'jest-plugin';
const PLUGIN_PACKAGE_NAME: '@rushstack/heft-jest-plugin' = '@rushstack/heft-jest-plugin';
const PLUGIN_PACKAGE_FOLDER: string = path.resolve(__dirname, '..');
const JEST_CONFIGURATION_LOCATION: 'config/jest.config.json' = `config/jest.config.json`;
export const JEST_CONFIG_JSDOM_PACKAGE_NAME: 'jest-environment-jsdom' = 'jest-environment-jsdom';

const ROOTDIR_TOKEN: '<rootDir>' = '<rootDir>';
const CONFIGDIR_TOKEN: '<configDir>' = '<configDir>';
const PACKAGE_CAPTUREGROUP: 'package' = 'package';
const PACKAGEDIR_REGEX: RegExp = /^<packageDir:\s*(?<package>[^\s>]+)\s*>/;
const JSONPATHPROPERTY_REGEX: RegExp = /^\$\['([^']+)'\]/;

const JEST_CONFIG_PACKAGE_FOLDER: string = path.dirname(require.resolve('jest-config'));

let _jestConfigurationFileLoader: ProjectConfigurationFile<IHeftJestConfiguration> | undefined;

/**
 * @internal
 */
export default class JestPlugin implements IHeftTaskPlugin<IJestPluginOptions> {
  #nodeEnvSet: boolean | undefined;
  /**
   * The modified times of the test input files seen by the previous watch mode run, or `undefined`
   * before the first run.
   */
  #testInputFileTimes: Map<string, number> | undefined;

  /**
   * Setup the hooks and custom CLI options for the Jest plugin.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions?: IJestPluginOptions
  ): void {
    const { parameters } = taskSession;

    // Flags
    const detectOpenHandlesParameter: CommandLineFlagParameter =
      parameters.getFlagParameter('--detect-open-handles');
    const debugHeftReporterParameter: CommandLineFlagParameter =
      parameters.getFlagParameter('--debug-heft-reporter');
    const disableCodeCoverageParameter: CommandLineFlagParameter =
      parameters.getFlagParameter('--disable-code-coverage');
    const silentParameter: CommandLineFlagParameter = parameters.getFlagParameter('--silent');
    const updateSnapshotsParameter: CommandLineFlagParameter =
      parameters.getFlagParameter('--update-snapshots');
    const logHeapUsageParameter: CommandLineFlagParameter = parameters.getFlagParameter('--log-heap-usage');

    // Strings
    const configParameter: CommandLineStringParameter = parameters.getStringParameter('--config');
    const maxWorkersParameter: CommandLineStringParameter = parameters.getStringParameter('--max-workers');
    const testNamePatternParameter: CommandLineStringParameter =
      parameters.getStringParameter('--test-name-pattern');
    const testPathIgnorePatternsParameter: CommandLineStringParameter = parameters.getStringParameter(
      '--test-path-ignore-patterns'
    );
    const testPathPatternParameter: CommandLineStringParameter =
      parameters.getStringParameter('--test-path-pattern');

    // String lists
    const findRelatedTestsParameter: CommandLineStringListParameter =
      parameters.getStringListParameter('--find-related-tests');

    // Integers
    const testTimeoutParameter: CommandLineIntegerParameter =
      parameters.getIntegerParameter('--test-timeout-ms');

    const options: IJestPluginOptions = {
      ...pluginOptions,
      configurationPath: configParameter.value || pluginOptions?.configurationPath,
      debugHeftReporter: debugHeftReporterParameter.value || pluginOptions?.debugHeftReporter,
      detectOpenHandles: detectOpenHandlesParameter.value || pluginOptions?.detectOpenHandles,
      disableCodeCoverage: disableCodeCoverageParameter.value || pluginOptions?.disableCodeCoverage,
      logHeapUsage: logHeapUsageParameter.value || pluginOptions?.logHeapUsage,
      findRelatedTests: findRelatedTestsParameter.values.length
        ? Array.from(findRelatedTestsParameter.values)
        : pluginOptions?.findRelatedTests,
      maxWorkers: maxWorkersParameter.value || pluginOptions?.maxWorkers,
      // Default to true and always pass with no tests
      passWithNoTests: true,
      silent: silentParameter.value || pluginOptions?.silent,
      testNamePattern: testNamePatternParameter.value || pluginOptions?.testNamePattern,
      testPathIgnorePatterns: testPathIgnorePatternsParameter.value || pluginOptions?.testPathIgnorePatterns,
      testPathPattern: testPathPatternParameter.value || pluginOptions?.testPathPattern,
      testTimeout: testTimeoutParameter.value ?? pluginOptions?.testTimeout,
      updateSnapshots: updateSnapshotsParameter.value || pluginOptions?.updateSnapshots,
      enableNodeEnvManagement: pluginOptions?.enableNodeEnvManagement ?? true
    };

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this.#runJestAsync(taskSession, heftConfiguration, options);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this.#runJestWatchAsync(taskSession, heftConfiguration, options, runIncrementalOptions);
      }
    );
  }

  /**
   * Runs Jest using the provided options.
   */
  async #runJestAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IJestPluginOptions
  ): Promise<void> {
    const jestArgv: Config.Argv | undefined = await this.#createJestArgvAsync(
      taskSession,
      heftConfiguration,
      options
    );
    if (!jestArgv) {
      return;
    }

    await this.#executeJestAsync(taskSession, heftConfiguration, options, jestArgv);
  }

  /**
   * Runs Jest in watch mode. Heft owns the watch loop: each incremental run re-executes the test
   * suite through the public `runCLI` API if any file under the Jest `roots` has changed since
   * the previous run. Jest 30 bundles `@jest/core` into a single module, so its internal `watch`
   * and `runJest` implementations can no longer be patched to let Heft orchestrate Jest's own
   * watch mode.
   */
  async #runJestWatchAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IJestPluginOptions,
    runIncrementalOptions: IHeftTaskRunIncrementalHookOptions
  ): Promise<void> {
    const jestArgv: Config.Argv | undefined = await this.#createJestArgvAsync(
      taskSession,
      heftConfiguration,
      options
    );
    if (!jestArgv) {
      return;
    }

    const { buildFolderPath, tempFolderPath } = heftConfiguration;
    const {
      roots = [ROOTDIR_TOKEN],
      coverageDirectory = `${ROOTDIR_TOKEN}/coverage`
    }: IHeftJestConfiguration = JSON.parse(jestArgv.config as string);

    // Jest writes its cache and coverage output while running, so those folders must not be watched,
    // otherwise every test run would schedule another one.
    const ignoredFolderPaths: Set<string> = new Set([
      path.resolve(tempFolderPath),
      _resolveRootDirPath(coverageDirectory, buildFolderPath)
    ]);

    // Read the test inputs through watchFs so that Heft schedules another incremental run when any of
    // them change. The modified times are read directly rather than through watchGlobAsync, because
    // its change detection relies on the watcher's cached times, which may not yet include files that
    // the build phase wrote just before this run.
    const { watchFs } = runIncrementalOptions;
    const testInputFileTimes: Map<string, number> = new Map();
    const collectFileTimes = (folderPath: string): void => {
      let entries: Dirent[];
      try {
        entries = watchFs.readdirSync(folderPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const entryPath: string = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && !ignoredFolderPaths.has(entryPath)) {
            collectFileTimes(entryPath);
          }
        } else {
          try {
            testInputFileTimes.set(entryPath, watchFs.statSync(entryPath).mtimeMs);
          } catch {
            // The file was deleted while reading the folder
          }
        }
      }
    };
    for (const root of roots) {
      collectFileTimes(_resolveRootDirPath(root, buildFolderPath));
    }

    const previousTestInputFileTimes: Map<string, number> | undefined = this.#testInputFileTimes;
    let hasChanges: boolean =
      !previousTestInputFileTimes || previousTestInputFileTimes.size !== testInputFileTimes.size;
    for (const [filePath, time] of testInputFileTimes) {
      if (hasChanges) {
        break;
      }
      hasChanges = previousTestInputFileTimes?.get(filePath) !== time;
    }
    this.#testInputFileTimes = testInputFileTimes;

    if (!hasChanges) {
      taskSession.logger.terminal.writeLine(`No pending test runs.`);
      return;
    }

    await this.#executeJestAsync(taskSession, heftConfiguration, options, jestArgv);
  }

  async #executeJestAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IJestPluginOptions,
    jestArgv: Config.Argv
  ): Promise<void> {
    const logger: IScopedLogger = taskSession.logger;
    const terminal: ITerminal = logger.terminal;

    this.#setNodeEnvIfRequested(options, logger);

    const { getVersion, runCLI } = await import(`@jest/core`);
    terminal.writeLine(`Using Jest version ${getVersion()}`);

    const {
      // Config.Argv is weakly typed.  After updating the jestArgv object, it's a good idea to inspect "globalConfig"
      // in the debugger to validate that your changes are being applied as expected.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      globalConfig,
      results: jestResults
    } = await runCLI(jestArgv, [heftConfiguration.buildFolderPath]);

    this.#resetNodeEnv();

    if (jestResults.numFailedTests > 0) {
      logger.emitError(
        new Error(
          `${jestResults.numFailedTests} Jest test${jestResults.numFailedTests > 1 ? 's' : ''} failed`
        )
      );
    } else if (jestResults.numFailedTestSuites > 0) {
      logger.emitError(
        new Error(
          `${jestResults.numFailedTestSuites} Jest test suite${
            jestResults.numFailedTestSuites > 1 ? 's' : ''
          } failed`
        )
      );
    }
  }

  async #createJestArgvAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IJestPluginOptions
  ): Promise<Config.Argv | undefined> {
    const logger: IScopedLogger = taskSession.logger;
    const { terminal } = logger;

    const buildFolderPath: string = heftConfiguration.buildFolderPath;
    const projectRelativeFilePath: string = options?.configurationPath ?? JEST_CONFIGURATION_LOCATION;
    let jestConfig: IHeftJestConfiguration;
    if (options?.disableConfigurationModuleResolution) {
      // Module resolution explicitly disabled, use the config as-is
      const jestConfigPath: string = path.join(buildFolderPath, projectRelativeFilePath);
      if (!(await FileSystem.existsAsync(jestConfigPath))) {
        logger.emitError(new Error(`Expected to find jest config file at "${jestConfigPath}".`));
        return;
      }
      jestConfig = await JsonFile.loadAsync(jestConfigPath);
      const extendedJestConfig: IExtendedHeftJestConfiguration = jestConfig as IExtendedHeftJestConfiguration;
      if (extendedJestConfig.extends) {
        throw new Error(
          'The provided jest.config.json specifies an "extends" property while resolved modules are disabled. ' +
            'You must either remove the "extends" property from your Jest configuration, use the "preset" ' +
            'property, or set the "disableConfigurationModuleResolution" option to "false" on the Jest ' +
            'plugin in heft.json.'
        );
      }
    } else {
      // Load in and resolve the config file using the "extends" field
      jestConfig = await JestPlugin._getJestConfigurationLoader(
        buildFolderPath,
        projectRelativeFilePath
      ).loadConfigurationFileForProjectAsync(
        terminal,
        heftConfiguration.buildFolderPath,
        heftConfiguration.rigConfig
      );
    }

    // If no displayName is provided, use the package name. This field is used by Jest to
    // differentiate in multi-project repositories, and since we have the context, we may
    // as well provide it.
    if (!jestConfig.displayName) {
      jestConfig.displayName = heftConfiguration.projectPackageJson.name;
    }

    let silent: boolean | undefined;
    if (taskSession.parameters.verbose || taskSession.parameters.debug) {
      // If Heft's "--verbose" or "--debug" parameters were used, then we're debugging Jest problems,
      // so we always want to see "console.log()" even if jest.config.json asked to suppress it.
      // If someone really dislikes that, we could expose "--silent" in the Heft CLI,
      // but it is a confusing combination.
      silent = false;
    } else {
      // If "silent" is specified via IJestPluginOptions, that takes precedence over jest.config.json
      silent = options.silent ?? jestConfig.silent ?? false;
    }

    const jestArgv: Config.Argv = {
      // In debug mode, avoid forking separate processes that are difficult to debug
      runInBand: taskSession.parameters.debug,
      debug: taskSession.parameters.debug,
      detectOpenHandles: options.detectOpenHandles || false,
      logHeapUsage: options.logHeapUsage || false,

      // Use the temp folder. Cache is unreliable, so we want it cleared on every --clean run
      cacheDirectory: taskSession.tempFolderPath,
      updateSnapshot: options.updateSnapshots,

      listTests: false,
      rootDir: buildFolderPath,

      // What these fields mean for Jest:
      //
      // If "silent" is true:
      // - Jest discards all console.log() output and there is no way to retrieve it
      //
      // If "silent" is false and "verbose" is false:
      // - Jest uses BufferedConsole which doesn't show console.log() until after the test run completes,
      //   which is annoying in the debugger.  The output is formatted nicely using HeftJestReporter.
      //
      // If "silent" is false and "verbose" is true:
      // - Jest uses CustomConsole which logs immediately, but shows ugly call stacks with each log.
      //
      // If "verbose" is true (regardless of "silent"):
      // - Jest reports include detailed results for every test, even if all tests passed within a test suite.
      silent,
      verbose: taskSession.parameters.verbose || taskSession.parameters.debug,

      testNamePattern: options.testNamePattern,
      testPathIgnorePatterns: options.testPathIgnorePatterns ? [options.testPathIgnorePatterns] : undefined,
      testPathPatterns: options.testPathPattern ? [options.testPathPattern] : undefined,
      testTimeout: options.testTimeout,
      maxWorkers: options.maxWorkers,

      passWithNoTests: options.passWithNoTests,

      $0: process.argv0,
      _: []
    };

    if (!options.debugHeftReporter) {
      // Extract the reporters and transform to include the Heft reporter by default
      (jestArgv as unknown as { reporters: JestReporterConfig[] }).reporters = _extractHeftJestReporters(
        taskSession,
        heftConfiguration,
        jestConfig,
        projectRelativeFilePath
      );
    } else {
      logger.emitWarning(
        new Error('The "--debug-heft-reporter" parameter was specified; disabling HeftJestReporter')
      );
    }

    if (options.findRelatedTests?.length) {
      // Pass test names as the command line remainder
      jestArgv.findRelatedTests = true;
      jestArgv._ = [...options.findRelatedTests];
    }

    if (options.disableCodeCoverage) {
      jestConfig.collectCoverage = false;
    }

    // Stringify the config and pass it into Jest directly
    jestArgv.config = JSON.stringify(jestConfig);

    return jestArgv;
  }

  /**
   * Returns the loader for the `config/api-extractor-task.json` config file.
   */
  public static _getJestConfigurationLoader(
    buildFolder: string,
    projectRelativeFilePath: string
  ): ProjectConfigurationFile<IHeftJestConfiguration> {
    if (!_jestConfigurationFileLoader) {
      // By default, ConfigurationFile will replace all objects, so we need to provide merge functions for these
      const shallowObjectInheritanceFunc: <T extends Record<string, unknown> | undefined>(
        currentObject: T,
        parentObject: T
      ) => T = <T>(currentObject: T, parentObject?: T): T => {
        // Merged in this order to ensure that the currentObject properties take priority in order-of-definition,
        // since Jest executes them in this order. For example, if the extended Jest configuration contains a
        // "\\.(css|sass|scss)$" transform but the extending Jest configuration contains a "\\.(css)$" transform,
        // merging like this will ensure that the returned transforms are executed in the correct order, stopping
        // after hitting the first pattern that applies:
        // {
        //   "\\.(css)$": "...",
        //   "\\.(css|sass|scss)$": "..."
        // }
        // https://github.com/facebook/jest/blob/0a902e10e0a5550b114340b87bd31764a7638729/packages/jest-config/src/normalize.ts#L102
        return { ...(currentObject || {}), ...(parentObject || {}), ...(currentObject || {}) } as T;
      };
      const deepObjectInheritanceFunc: <T extends Record<string, unknown> | undefined>(
        currentObject: T,
        parentObject: T
      ) => T = <T>(currentObject: T, parentObject: T): T => {
        return Objects.mergeWith(parentObject || {}, currentObject || {}, (value, source) => {
          // Need to use a custom inheritance function instead of "InheritanceType.merge" since
          // some properties are allowed to have different types which may be incompatible with
          // merging.
          if (source === null || typeof source !== 'object') {
            return source;
          }
          if (Array.isArray(source)) {
            return Array.isArray(value) ? [...value, ...source] : source;
          }
          if (Objects.isRecord(source)) {
            return { ...(Objects.isRecord(value) ? value : {}), ...source };
          }
          return source;
        }) as T;
      };

      const tokenResolveMetadata: ICustomJsonPathMetadata<IHeftJestConfiguration> = _getJsonPathMetadata({
        rootDir: buildFolder
      });
      const jestResolveMetadata: ICustomJsonPathMetadata<IHeftJestConfiguration> = _getJsonPathMetadata({
        rootDir: buildFolder,
        resolveAsModule: true
      });

      _jestConfigurationFileLoader = new ProjectConfigurationFile<IHeftJestConfiguration>({
        projectRelativeFilePath: projectRelativeFilePath,
        // Bypass Jest configuration validation
        jsonSchemaObject: anythingSchema,
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
          },
          roots: {
            inheritanceType: InheritanceType.replace
          },
          testMatch: {
            inheritanceType: InheritanceType.replace
          },
          transformIgnorePatterns: {
            inheritanceType: InheritanceType.replace
          },
          collectCoverageFrom: {
            inheritanceType: InheritanceType.replace
          }
        },
        jsonPathMetadata: {
          // string
          '$.cacheDirectory': tokenResolveMetadata,
          '$.coverageDirectory': tokenResolveMetadata,
          '$.dependencyExtractor': jestResolveMetadata,
          '$.filter': jestResolveMetadata,
          '$.globalSetup': jestResolveMetadata,
          '$.globalTeardown': jestResolveMetadata,
          '$.moduleLoader': jestResolveMetadata,
          '$.preset': jestResolveMetadata,
          '$.prettierPath': jestResolveMetadata,
          '$.resolver': jestResolveMetadata,
          '$.runner': jestResolveMetadata,
          '$.snapshotResolver': jestResolveMetadata,
          '$.testEnvironment': jestResolveMetadata,
          '$.testResultsProcessor': jestResolveMetadata,
          '$.testRunner': jestResolveMetadata,
          '$.testSequencer': jestResolveMetadata,
          // string[]
          '$.modulePaths.*': tokenResolveMetadata,
          '$.roots.*': tokenResolveMetadata,
          '$.setupFiles.*': jestResolveMetadata,
          '$.setupFilesAfterEnv.*': jestResolveMetadata,
          '$.snapshotSerializers.*': jestResolveMetadata,
          // moduleNameMapper: { [regex]: path | [ ...paths ] }
          '$.moduleNameMapper.*@string()': tokenResolveMetadata, // string path
          '$.moduleNameMapper.*.*': tokenResolveMetadata, // array of paths
          // reporters: (path | [ path, options ])[]
          '$.reporters[?(@ !== "default")]*@string()': jestResolveMetadata, // string path, excluding "default"
          '$.reporters.*[?(@property == 0 && @ !== "default")]': jestResolveMetadata, // First entry in [ path, options ], excluding "default"
          // transform: { [regex]: path | [ path, options ] }
          '$.transform.*@string()': jestResolveMetadata, // string path
          '$.transform.*[?(@property == 0)]': jestResolveMetadata, // First entry in [ path, options ]
          // watchPlugins: (path | [ path, options ])[]
          '$.watchPlugins.*@string()': jestResolveMetadata, // string path
          '$.watchPlugins.*[?(@property == 0)]': jestResolveMetadata // First entry in [ path, options ]
        }
      });
    }

    return _jestConfigurationFileLoader;
  }

  #setNodeEnvIfRequested(options: IJestPluginOptions, logger: IScopedLogger): void {
    if (options.enableNodeEnvManagement) {
      if (process.env.NODE_ENV) {
        if (process.env.NODE_ENV !== 'test') {
          // In the future, we may consider just setting this and not warning
          logger.emitWarning(
            new Error(`NODE_ENV variable is set and it's not "test". NODE_ENV=${process.env.NODE_ENV}`)
          );
        }
      } else {
        process.env.NODE_ENV = 'test';
        this.#nodeEnvSet = true;
      }
    }
  }

  #resetNodeEnv(): void {
    // unset the NODE_ENV only if we have set it
    if (this.#nodeEnvSet) {
      delete process.env.NODE_ENV;
    }
  }
}

function _extractHeftJestReporters(
  taskSession: IHeftTaskSession,
  heftConfiguration: HeftConfiguration,
  config: IHeftJestConfiguration,
  projectRelativeFilePath: string
): JestReporterConfig[] {
  let isUsingHeftReporter: boolean = false;

  const logger: IScopedLogger = taskSession.logger;
  const terminal: ITerminal = logger.terminal;
  const reporterOptions: IHeftJestReporterOptions = {
    heftConfiguration,
    logger,
    debugMode: taskSession.parameters.debug
  };
  if (Array.isArray(config.reporters)) {
    // Harvest all the array indices that need to modified before altering the array
    const heftReporterIndices: number[] = _findIndexes(config.reporters, 'default');

    // Replace 'default' reporter with the heft reporter
    // This may clobber default reporters options
    if (heftReporterIndices.length > 0) {
      const heftReporter: Config.ReporterConfig = _getHeftJestReporterConfig(reporterOptions);
      for (const index of heftReporterIndices) {
        config.reporters[index] = heftReporter;
      }
      isUsingHeftReporter = true;
    }
  } else if (typeof config.reporters === 'undefined' || config.reporters === null) {
    // Otherwise if no reporters are specified install only the heft reporter
    config.reporters = [_getHeftJestReporterConfig(reporterOptions)];
    isUsingHeftReporter = true;
  } else {
    // Making a note if Heft cannot understand the reporter entry in Jest config
    // Not making this an error or warning because it does not warrant blocking a dev or CI test pass
    // If the Jest config is truly wrong Jest itself is in a better position to report what is wrong with the config
    terminal.writeVerboseLine(
      `The 'reporters' entry in Jest config '${projectRelativeFilePath}' is in an unexpected format. Was ` +
        'expecting an array of reporters'
    );
  }

  if (!isUsingHeftReporter) {
    terminal.writeVerboseLine(
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
function _getHeftJestReporterConfig(reporterOptions: IHeftJestReporterOptions): Config.ReporterConfig {
  return [
    `${__dirname}/HeftJestReporter.js`,
    reporterOptions as Record<keyof IHeftJestReporterOptions, unknown>
  ];
}

/**
 * Resolves a Jest config path to an absolute path. The config loader already replaces `<rootDir>` tokens,
 * except when "disableConfigurationModuleResolution" is set.
 */
function _resolveRootDirPath(configPath: string, rootDir: string): string {
  if (configPath.startsWith(ROOTDIR_TOKEN)) {
    configPath = path.normalize('./' + configPath.slice(ROOTDIR_TOKEN.length));
  }
  return path.resolve(rootDir, configPath);
}

/**
 * Resolve all specified properties to an absolute path using Jest resolution. In addition, the following
 * transforms will be applied to the provided propertyValue before resolution:
 *   - replace `<rootDir>` with the same rootDir
 *   - replace `<configDir>` with the directory containing the current configuration file
 *   - replace `<packageDir:...>` with the path to the resolved package (NOT module)
 */
function _getJsonPathMetadata(
  options: IJestResolutionOptions
): ICustomJsonPathMetadata<IHeftJestConfiguration> {
  return {
    customResolver: (resolverOptions: IJsonPathMetadataResolverOptions<IHeftJestConfiguration>) => {
      const { propertyName, configurationFilePath, configurationFile } = resolverOptions;
      let { propertyValue } = resolverOptions;

      const configDir: string = path.dirname(configurationFilePath);
      const parsedPropertyName: string | undefined = propertyName?.match(JSONPATHPROPERTY_REGEX)?.[1];

      function requireResolveFunction(request: string): string {
        return require.resolve(request, {
          paths: [configDir, PLUGIN_PACKAGE_FOLDER, JEST_CONFIG_PACKAGE_FOLDER]
        });
      }

      // Compare with replaceRootDirInPath() from here:
      // https://github.com/facebook/jest/blob/5f4dd187d89070d07617444186684c20d9213031/packages/jest-config/src/utils.ts#L58
      if (propertyValue.startsWith(ROOTDIR_TOKEN)) {
        // Example:  <rootDir>/path/to/file.js
        const restOfPath: string = path.normalize('./' + propertyValue.slice(ROOTDIR_TOKEN.length));
        propertyValue = path.resolve(options.rootDir, restOfPath);
      } else if (propertyValue.startsWith(CONFIGDIR_TOKEN)) {
        // Example:  <configDir>/path/to/file.js
        const restOfPath: string = path.normalize('./' + propertyValue.slice(CONFIGDIR_TOKEN.length));
        propertyValue = path.resolve(configDir, restOfPath);
      } else {
        // Example:  <packageDir:@my/package>/path/to/file.js
        const packageDirMatches: RegExpExecArray | null = PACKAGEDIR_REGEX.exec(propertyValue);
        if (packageDirMatches !== null) {
          const packageName: string | undefined = packageDirMatches.groups?.[PACKAGE_CAPTUREGROUP];
          if (!packageName) {
            throw new Error(
              `Could not parse package name from "packageDir" token ` +
                (parsedPropertyName ? `of property "${parsedPropertyName}" ` : '') +
                `in "${configDir}".`
            );
          }

          if (!PackageName.isValidName(packageName)) {
            throw new Error(
              `Module paths are not supported when using the "packageDir" token ` +
                (parsedPropertyName ? `of property "${parsedPropertyName}" ` : '') +
                `in "${configDir}". Only a package name is allowed.`
            );
          }

          // Resolve to the package directory (not the module referenced by the package). The normal resolution
          // method will generally not be able to find @rushstack/heft-jest-plugin from a project that is
          // using a rig. Since it is important, and it is our own package, we resolve it manually as a special
          // case.
          const resolvedPackagePath: string =
            packageName === PLUGIN_PACKAGE_NAME
              ? PLUGIN_PACKAGE_FOLDER
              : Import.resolvePackage({ baseFolderPath: configDir, packageName, useNodeJSResolver: true });
          // First entry is the entire match
          const restOfPath: string = path.normalize('./' + propertyValue.slice(packageDirMatches[0].length));
          propertyValue = path.resolve(resolvedPackagePath, restOfPath);
        }
      }

      // Return early, since the remainder of this function is used to resolve module paths
      if (!options.resolveAsModule) {
        return propertyValue;
      }

      // Example:  @rushstack/heft-jest-plugin
      if (propertyValue === PLUGIN_PACKAGE_NAME) {
        return PLUGIN_PACKAGE_FOLDER;
      }

      // Example:  @rushstack/heft-jest-plugin/path/to/file.js
      if (propertyValue.startsWith(PLUGIN_PACKAGE_NAME)) {
        const restOfPath: string = path.normalize('./' + propertyValue.slice(PLUGIN_PACKAGE_NAME.length));
        return path.join(PLUGIN_PACKAGE_FOLDER, restOfPath);
      }

      // Use the Jest-provided resolvers to resolve the module paths
      switch (parsedPropertyName) {
        case 'testRunner':
          return resolveRunner(/*resolver:*/ undefined, {
            rootDir: configDir,
            filePath: propertyValue,
            requireResolveFunction
          });

        case 'testSequencer':
          return resolveSequencer(/*resolver:*/ undefined, {
            rootDir: configDir,
            filePath: propertyValue,
            requireResolveFunction
          });

        case 'testEnvironment':
          return resolveTestEnvironment({
            rootDir: configDir,
            testEnvironment: propertyValue,
            requireResolveFunction
          });

        case 'watchPlugins':
          return resolveWatchPlugin(/*resolver:*/ undefined, {
            rootDir: configDir,
            filePath: propertyValue,
            requireResolveFunction
          });

        case 'preset':
          // Do not allow use of presets and extends together, since that would create a
          // confusing hierarchy.
          if (configurationFile.preset && (configurationFile as IHeftJestConfigurationWithExtends).extends) {
            throw new Error(
              `The configuration file at "${configurationFilePath}" cannot specify both "preset" and ` +
                `"extends" properties.`
            );
          }

          // Preset is an odd value, since it can either be a relative path to a preset module
          // from the rootDir, or a path to the parent directory of a preset module. So to
          // determine which it is, we will attempt to resolve it as a module from the rootDir,
          // as per the spec. If it resolves, then we will return the relative path to the
          // resolved value from the rootDir. If it does not resolve, then we will return the
          // original value to allow Jest to resolve within the target directory.
          // See: https://github.com/jestjs/jest/blob/268afca708199c0e64ef26f35995907faf4454ff/packages/jest-config/src/normalize.ts#L123

          let resolvedValue: string | null | undefined;
          try {
            resolvedValue = jestResolve(/*resolver:*/ undefined, {
              rootDir: options.rootDir,
              filePath: propertyValue,
              key: propertyName
            });
          } catch (e) {
            // Swallow
          }
          if (resolvedValue) {
            // Jest will resolve relative module paths to files only if they use forward slashes.
            // They must also start with a '.' otherwise the preset resolution will assume it is a
            // folder path and will path.join() it with the default 'jest-preset' filename.
            // See: https://github.com/jestjs/jest/blob/268afca708199c0e64ef26f35995907faf4454ff/packages/jest-config/src/normalize.ts#L123
            return Path.convertToSlashes(`./${path.relative(options.rootDir, resolvedValue)}`);
          } else {
            return propertyValue;
          }

        default:
          // We know the value will be non-null since resolve will throw an error if it is null
          // and non-optional
          return jestResolve(/*resolver:*/ undefined, {
            rootDir: configDir,
            filePath: propertyValue,
            key: propertyName
          })!;
      }
    },
    pathResolutionMethod: PathResolutionMethod.custom
  };
}

/**
 * Finds the indices of jest reporters with a given name
 */
function _findIndexes(items: JestReporterConfig[], search: string): number[] {
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
