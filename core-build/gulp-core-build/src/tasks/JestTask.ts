// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as path from 'path';
import { GulpTask } from './GulpTask';
import * as Gulp from 'gulp';
import * as Jest from 'jest-cli';

/**
 * Configuration for JestTask
 * @public
 */
export interface IJestConfig {
  /**
   * Indicate whether the test is running in a CI environment
   * If not provided, the default value is true.
   */
  ci?: boolean;

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

  /**
   * Run all tests serially in the current process, rather than creating a worker pool of child processes that run tests
   * If not provided, the default value is false.
   */
  updateSnapshot?: boolean;
}

const DEFAULT_JEST_CONFIG_FILE_NAME: string = 'jest.config.json';

/**
 * This task takes in a map of dest: [sources], and copies items from one place to another.
 * @public
 */
export class JestTask extends GulpTask<IJestConfig> {

  constructor() {
    super('jest',
    {
      ci: true,
      configFilePath: DEFAULT_JEST_CONFIG_FILE_NAME,
      coverage: true,
      maxWorkers: 1,
      runInBand: true,
      updateSnapshot: false
    });
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
      this.taskConfig.configFilePath || DEFAULT_JEST_CONFIG_FILE_NAME);

    Jest.runCLI(
      {
        ci: this.taskConfig.ci,
        config: configFileFullPath,
        coverage: this.taskConfig.coverage,
        maxWorkers: this.taskConfig.maxWorkers,
        runInBand: this.taskConfig.runInBand,
        updateSnapshot: this.taskConfig.updateSnapshot
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