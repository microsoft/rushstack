// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { runCLI } from '@jest/core';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { IHeftJestReporterOptions } from './HeftJestReporter';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { ITestStageContext } from '../../stages/TestStage';
import { ICleanStageContext } from '../../stages/CleanStage';
import { JestTypeScriptDataFile, IJestTypeScriptDataFileJson } from './JestTypeScriptDataFile';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import { Config } from '@jest/types';

type JestReporterConfig = string | Config.ReporterConfig;
const PLUGIN_NAME: string = 'JestPlugin';
const JEST_CONFIGURATION_LOCATION: string = path.join('config', 'jest.config.json');

export class JestPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestStageContext) => {
      test.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        await this._runJestAsync(heftSession, heftConfiguration, test);
      });
    });

    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      this._includeJestCacheWhenCleaning(heftConfiguration, clean);
    });
  }

  private async _runJestAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    test: ITestStageContext
  ): Promise<void> {
    const jestLogger: ScopedLogger = heftSession.requestScopedLogger('jest');
    const buildFolder: string = heftConfiguration.buildFolder;

    const expectedConfigPath: string = this._getJestConfigPath(heftConfiguration);

    if (!FileSystem.exists(expectedConfigPath)) {
      jestLogger.emitError(new Error(`Expected to find jest config file at ${expectedConfigPath}`));
      return;
    }

    // In watch mode, Jest starts up in parallel with the compiler, so there's no
    // guarantee that the output files would have been written yet.
    if (!test.properties.watchMode) {
      this._validateJestTypeScriptDataFile(buildFolder);
    }

    const jestArgv: Config.Argv = {
      watch: test.properties.watchMode,

      // In debug mode, avoid forking separate processes that are difficult to debug
      runInBand: heftSession.debugMode,
      debug: heftSession.debugMode,

      config: expectedConfigPath,
      cacheDirectory: this._getJestCacheFolder(heftConfiguration),
      updateSnapshot: test.properties.updateSnapshots,

      listTests: false,
      rootDir: buildFolder,

      silent: test.properties.silent,
      testNamePattern: test.properties.testNamePattern,
      testPathPattern: test.properties.testPathPattern ? [...test.properties.testPathPattern] : undefined,
      testTimeout: test.properties.testTimeout,
      maxWorkers: test.properties.maxWorkers,

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
      // This is Jest's weird way of representing space-delimited CLI parameters
      jestArgv._ = [...test.properties.findRelatedTests];
    }

    const { results: jestResults } = await runCLI(jestArgv, [buildFolder]);

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
    // Full path to jest-typescript-data.json
    const jestTypeScriptDataFile: IJestTypeScriptDataFileJson = JestTypeScriptDataFile.loadForProject(
      buildFolder
    );
    const emitFolderPathForJest: string = path.join(
      buildFolder,
      jestTypeScriptDataFile.emitFolderNameForTests
    );
    if (!FileSystem.exists(emitFolderPathForJest)) {
      throw new Error(
        'The transpiler output folder does not exist:\n  ' +
          emitFolderPathForJest +
          '\nWas the compiler invoked? Is the "emitFolderNameForTests" setting correctly' +
          ' specified in .heft/typescript.json?\n'
      );
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
