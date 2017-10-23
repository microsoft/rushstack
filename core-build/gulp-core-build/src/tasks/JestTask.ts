// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as path from 'path';
import * as fsx from 'fs-extra';
import { GulpTask} from './GulpTask';
import { IBuildConfig } from '../IBuildConfig';
import * as Gulp from 'gulp';
import * as Jest from 'jest-cli';

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

  /**
   * Specifies the maximum number of workers the worker-pool will spawn for running tests.
   * If not provided, the default value is 1.
   */
  maxWorkers?: number;

  /**
   * Indicates that test coverage information should be collected and reported in the output.
   * If not provided, the default value is true.
   */
  runInBand?: boolean;
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
      coverage: true,
      maxWorkers: 1,
      runInBand: true
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

    Jest.runCLI(
      {
        ci: this.buildConfig.production,
        config: configFileFullPath,
        coverage: this.taskConfig.coverage,
        maxWorkers: this.taskConfig.maxWorkers,
        runInBand: this.taskConfig.runInBand,
        updateSnapshot: !this.buildConfig.production,
        rootDir: this.buildConfig.rootPath,
        testMatch: ['**/*.test.js?(x)'],
        testPathIgnorePatterns: ['<rootDir>/(src|lib-amd|lib-es6|coverage|build|docs|node_modules)/'],
        collectCoverageFrom: ['lib/**/*.js?(x)'],
        reporters: [path.join(__dirname, 'JestReporter.js')]
      },
      [this.buildConfig.rootPath],
      (result) => {
        if (result.numFailedTests || result.numFailedTestSuites) {
          completeCallback(new Error('Jest tests failed'));
        } else {
          completeCallback();
        }
      });
  }
}