// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { runCLI } from '@jest/core';
import { FileSystem } from '@rushstack/node-core-library';

import { IHeftJestReporterOptions } from './HeftJestReporter';
import { HeftSnapshotResolver } from './HeftSnapshotResolver';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { ITestActionContext } from '../../cli/actions/TestAction';

const PLUGIN_NAME: string = 'JestPlugin';
const JEST_CONFIGURATION_LOCATION: string = './config/jest.config.json';

export class JestPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    if (FileSystem.exists(path.join(heftConfiguration.buildFolder, JEST_CONFIGURATION_LOCATION))) {
      heftSession.hooks.test.tap(PLUGIN_NAME, (test: ITestActionContext) => {
        test.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runJestAsync(heftConfiguration, test.properties.watchMode);
        });
      });
    }
  }

  private async _runJestAsync(heftConfiguration: HeftConfiguration, watchMode: boolean): Promise<void> {
    const buildFolder: string = heftConfiguration.buildFolder;
    HeftSnapshotResolver.buildRoot = heftConfiguration.buildFolder;
    const reporterOptions: IHeftJestReporterOptions = { heftConfiguration };
    const { results: jestResults } = await runCLI(
      {
        watch: watchMode,
        config: JEST_CONFIGURATION_LOCATION,
        reporters: [[path.resolve(__dirname, 'HeftJestReporter.js'), reporterOptions]],
        snapshotResolver: path.resolve(__dirname, 'heftSnapshotResolverInstance.js'),

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
}
