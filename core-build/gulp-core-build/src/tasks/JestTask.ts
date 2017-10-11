// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
   */
  ci: boolean;
  /**
   * The path to a jest config file
   */
  configFilePath: string;
  /**
   * Indicates that test coverage information should be collected and reported in the output
   */
  coverage: boolean;
  /**
   * Specifies the maximum number of workers the worker-pool will spawn for running tests.
   */
  maxWorkers: number;
  /**
   * The root directory for the project
   */
  rootDir: string;
  /**
   * Indicates that test coverage information should be collected and reported in the output
   */
  runInBand: boolean;
  /**
   * Run all tests serially in the current process, rather than creating a worker pool of child processes that run tests
   */
  updateSnapshot: boolean;
}

/**
 * This task takes in a map of dest: [sources], and copies items from one place to another.
 * @public
 */
export class JestTask extends GulpTask<IJestConfig> {

  constructor() {
    super('Jest',
    {
      ci: true,
      configFilePath: './jest.config.json',
      coverage: true,
      maxWorkers: 1,
      rootDir: '.',
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
    Jest.runCLI(
      {
        ci: this.taskConfig.ci,
        config: this.taskConfig.configFilePath,
        coverage: this.taskConfig.coverage,
        maxWorkers: this.taskConfig.maxWorkers,
        runInBand: this.taskConfig.runInBand,
        updateSnapshot: this.taskConfig.updateSnapshot
      },
      [this.taskConfig.rootDir],
      (result) => {
        if (result.numFailedTests || result.numFailedTestSuites) {
          completeCallback(new Error('Jest tests failed'));
        } else {
          completeCallback();
        }
      });
  }
}