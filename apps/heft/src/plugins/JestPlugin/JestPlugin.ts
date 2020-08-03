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

const PLUGIN_NAME: string = 'JestPlugin';
const JEST_CONFIGURATION_LOCATION: string = './config/jest.config.json';

export class JestPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

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
    const buildFolder: string = heftConfiguration.buildFolder;
    const reporterOptions: IHeftJestReporterOptions = { heftConfiguration };
    const { results: jestResults } = await runCLI(
      {
        watch: test.properties.watchMode,

        // In debug mode, avoid forking separate processes that are difficult to debug
        runInBand: heftSession.debugMode,
        debug: heftSession.debugMode,

        config: JEST_CONFIGURATION_LOCATION,
        reporters: [[path.resolve(__dirname, 'HeftJestReporter.js'), reporterOptions]],
        cacheDirectory: this._getJestCacheFolder(heftConfiguration),
        updateSnapshot: !test.properties.production,

        listTests: false,
        rootDir: buildFolder,
        $0: process.argv0,
        _: []
      },
      [buildFolder]
    );

    if (jestResults.numFailedTests > 0) {
      throw new Error(
        `${jestResults.numFailedTests} Jest test${jestResults.numFailedTests > 1 ? 's' : ''} failed`
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
