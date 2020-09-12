// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { runCLI } from '@jest/core';
import { FileSystem } from '@rushstack/node-core-library';

import { IHeftJestReporterOptions } from './HeftJestReporter';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { ITestStageContext } from '../../stages/TestStage';
import { ICleanStageContext } from '../../stages/CleanStage';
import { JestTypeScriptDataFile, IJestTypeScriptDataFileJson } from './JestTypeScriptDataFile';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import { Config } from '@jest/types';

const PLUGIN_NAME: string = 'JestPlugin';
const JEST_CONFIGURATION_LOCATION: string = './config/jest.config.json';

export class JestPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    if (FileSystem.exists(path.join(heftConfiguration.buildFolder, JEST_CONFIGURATION_LOCATION))) {
      heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestStageContext) => {
        test.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runJestAsync(heftSession, heftConfiguration, test);
        });
      });

      heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
        this._includeJestCacheWhenCleaning(heftConfiguration, clean);
      });
    }
  }

  private async _runJestAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    test: ITestStageContext
  ): Promise<void> {
    const jestLogger: ScopedLogger = heftSession.requestScopedLogger('jest');
    const buildFolder: string = heftConfiguration.buildFolder;

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

      config: JEST_CONFIGURATION_LOCATION,
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
      const reporterOptions: IHeftJestReporterOptions = {
        heftConfiguration,
        debugMode: heftSession.debugMode
      };
      jestArgv.reporters = [[path.resolve(__dirname, 'HeftJestReporter.js'), reporterOptions]];
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
      jestTypeScriptDataFile.emitFolderNameForJest
    );
    if (!FileSystem.exists(emitFolderPathForJest)) {
      throw new Error(
        'The transpiler output folder does not exist:\n  ' +
          emitFolderPathForJest +
          '\nWas the compiler invoked? Is the "emitFolderNameForJest" setting correctly' +
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

  private _getJestCacheFolder(heftConfiguration: HeftConfiguration): string {
    return path.join(heftConfiguration.buildCacheFolder, 'jest-cache');
  }
}
