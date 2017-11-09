// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as path from 'path';
import * as fsx from 'fs-extra';
import { GulpTask} from './GulpTask';
import { IBuildConfig } from '../IBuildConfig';
import * as Gulp from 'gulp';
import * as Jest from 'jest-cli';
import * as globby from 'globby';

/**
 * Configuration for JestTask
 * @public
 */
export interface IJestConfig {
  /**
   * Indicate whether this task is enabled. The default value is false.
   */
  isEnabled?: boolean;

  /**
   * The jest config file relative to project root directory
   * If not provided, the default value is 'jest.config.json'.
   */
  configFilePath?: string;

  /**
   * Indicates that test coverage information should be collected and reported in the output
   * If not provided, the default value is true.
   */
  coverage?: boolean;
}

const DEFAULT_JEST_CONFIG_FILE_NAME: string = 'jest.config.json';

/**
 * Indicates if jest is enabled
 * @internal
 * @param rootFolder - package root folder
 */
export function _isJestEnabled(rootFolder: string): boolean {
  const taskConfigFile: string = path.join(rootFolder, 'config', 'jest.json');
  if (!fsx.existsSync(taskConfigFile)) {
    return false;
  }
  const taskConfig: {} = require(taskConfigFile);
  // tslint:disable-next-line:no-string-literal
  return !!taskConfig['isEnabled'];
}

/**
 * This task takes in a map of dest: [sources], and copies items from one place to another.
 * @public
 */
export class JestTask extends GulpTask<IJestConfig> {

  constructor() {
    super('jest',
    {
      coverage: true
    });
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return super.isEnabled(buildConfig) && !!this.taskConfig.isEnabled;
  }

  /**
   * Loads the z-schema object for this task
   */
  public loadSchema(): Object {
    return require('./jest.schema.json');
  }

  public executeTask(
    gulp: typeof Gulp,
    completeCallback: (error?: string | Error) => void
  ): void {
    const configFileFullPath: string = path.join(this.buildConfig.rootPath,
      'config', DEFAULT_JEST_CONFIG_FILE_NAME);

    this._copySnapshots(this.buildConfig.srcFolder, this.buildConfig.libFolder);
    Jest.runCLI(
      {
        ci: this.buildConfig.production,
        config: configFileFullPath,
        coverage: this.taskConfig.coverage,
        maxWorkers: 1,
        runInBand: true,
        updateSnapshot: !this.buildConfig.production,
        rootDir: this.buildConfig.rootPath,
        testMatch: ['**/*.test.js?(x)'],
        testPathIgnorePatterns: ['<rootDir>/(src|lib-amd|lib-es6|coverage|build|docs|node_modules)/'],
        collectCoverageFrom: ['lib/**/*.js?(x)', '!lib/resx-strings/**', '!lib/**/test/**'],
        reporters: ['default', path.join(__dirname, 'JestReporter.js')],
        moduleDirectories: ['node_modules', this.buildConfig.libFolder],
        coverageDirectory: path.join(this.buildConfig.tempFolder, 'coverage'),
        coverageReporters: ['json', 'html']
      },
      [this.buildConfig.rootPath],
      (result) => {
        if (result.numFailedTests || result.numFailedTestSuites) {
          completeCallback(new Error('Jest tests failed'));
        } else {
          if (!this.buildConfig.production) {
            this._copySnapshots(this.buildConfig.libFolder, this.buildConfig.srcFolder);
          }
          completeCallback();
        }
      });
  }

  private _copySnapshots(srcRoot: string, destRoot: string): void {
    const pattern: string = path.join(srcRoot, '**/__snapshots__/*.snap');
    globby.sync(pattern).forEach(sourceFile => {
      const destination: string = sourceFile.replace(srcRoot, destRoot);
      fsx.copySync(sourceFile, destination);
    });
  }
}