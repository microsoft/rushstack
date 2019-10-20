// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as path from 'path';
import { GulpTask} from './GulpTask';
import { IBuildConfig } from '../IBuildConfig';
import * as Gulp from 'gulp';
import * as Jest from 'jest-cli';
import * as globby from 'globby';
import { FileSystem, JsonObject } from '@microsoft/node-core-library';

/**
 * Configuration for JestTask
 * @alpha
 */
export interface IJestConfig {
  /**
   * Indicate whether this task is enabled. The default value is false.
   */
  isEnabled?: boolean;

  /**
   * Indicate whether Jest cache is enabled or not.
   */
  cache?: boolean;

  /**
   * Same as Jest CLI option collectCoverageFrom
   */
  collectCoverageFrom?: string[];

  /**
   * Same as Jest CLI option coverage
   */
  coverage?: boolean;

  /**
   * Same as Jest CLI option coverageReporters
   */
  coverageReporters?: string[];

  /**
   * Same as Jest CLI option testPathIgnorePatterns
   */
  testPathIgnorePatterns?: string[];

  /**
   * Same as Jest CLI option modulePathIgnorePatterns
   */
  modulePathIgnorePatterns?: string[];

  /**
   * Same as Jest CLI option moduleDirectories
   */
  moduleDirectories?: string[];

  /**
   * Same as Jest CLI option maxWorkers
   */
  maxWorkers?: number;

  /**
   * Same as Jest CLI option testMatch
   */
  testMatch?: string[];
}

const DEFAULT_JEST_CONFIG_FILE_NAME: string = 'jest.config.json';

/**
 * Indicates if jest is enabled
 * @internal
 * @param rootFolder - package root folder
 */
export function _isJestEnabled(rootFolder: string): boolean {
  const taskConfigFile: string = path.join(rootFolder, 'config', 'jest.json');
  if (!FileSystem.exists(taskConfigFile)) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const taskConfig: {} = require(taskConfigFile);
  // eslint-disable-next-line dot-notation
  return !!taskConfig['isEnabled'];
}

/**
 * This task takes in a map of dest: [sources], and copies items from one place to another.
 * @alpha
 */
export class JestTask extends GulpTask<IJestConfig> {

  public constructor() {
    super('jest',
    {
      cache: true,
      collectCoverageFrom: ['lib/**/*.js?(x)', '!lib/**/test/**'],
      coverage: true,
      coverageReporters: ['json', 'html'],
      testPathIgnorePatterns: ['<rootDir>/(src|lib-amd|lib-es6|coverage|build|docs|node_modules)/'],
      // Some unit tests rely on data folders that look like packages.  This confuses jest-hast-map
      // when it tries to scan for package.json files.
      modulePathIgnorePatterns: ['<rootDir>/(src|lib)/.*/package.json']
    });
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return super.isEnabled(buildConfig) && !!this.taskConfig.isEnabled;
  }

  /**
   * Loads the z-schema object for this task
   */
  public loadSchema(): JsonObject {
    return require('./jest.schema.json');
  }

  public executeTask(
    gulp: typeof Gulp,
    completeCallback: (error?: string | Error) => void
  ): void {
    const configFileFullPath: string = path.join(this.buildConfig.rootPath,
      'config', 'jest', DEFAULT_JEST_CONFIG_FILE_NAME);

    this._copySnapshots(this.buildConfig.srcFolder, this.buildConfig.libFolder);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jestConfig: any = {
      ci: this.buildConfig.production,
      cache: !!this.taskConfig.cache,
      config: FileSystem.exists(configFileFullPath) ? configFileFullPath : undefined,
      collectCoverageFrom: this.taskConfig.collectCoverageFrom,
      coverage: this.taskConfig.coverage,
      coverageReporters: this.taskConfig.coverageReporters,
      coverageDirectory: path.join(this.buildConfig.tempFolder, 'coverage'),
      maxWorkers: this.taskConfig.maxWorkers ?
        this.taskConfig.maxWorkers : 1,
      moduleDirectories: this.taskConfig.moduleDirectories ?
        this.taskConfig.moduleDirectories :
        ['node_modules', this.buildConfig.libFolder],
      reporters: [path.join(__dirname, 'JestReporter.js')],
      rootDir: this.buildConfig.rootPath,
      testMatch: this.taskConfig.testMatch ?
        this.taskConfig.testMatch : ['**/*.test.js?(x)'],
      testPathIgnorePatterns: this.taskConfig.testPathIgnorePatterns,
      modulePathIgnorePatterns: this.taskConfig.modulePathIgnorePatterns,
      updateSnapshot: !this.buildConfig.production,

      // Jest's module resolution for finding jest-environment-jsdom is broken.  See this issue:
      // https://github.com/facebook/jest/issues/5913
      // As a workaround, resolve it for Jest:
      testEnvironment: require.resolve('jest-environment-jsdom'),
      cacheDirectory: path.join(this.buildConfig.rootPath, this.buildConfig.tempFolder, 'jest-cache')
    };

    // suppress 'Running coverage on untested files...' warning
    const oldTTY: true | undefined = process.stdout.isTTY;
    process.stdout.isTTY = undefined;

    Jest.runCLI(jestConfig,
      [this.buildConfig.rootPath]).then(
      (result: { results: Jest.AggregatedResult, globalConfig: Jest.GlobalConfig }) => {
        process.stdout.isTTY = oldTTY;
        if (result.results.numFailedTests || result.results.numFailedTestSuites) {
          completeCallback(new Error('Jest tests failed'));
        } else {
          if (!this.buildConfig.production) {
            this._copySnapshots(this.buildConfig.libFolder, this.buildConfig.srcFolder);
          }
          completeCallback();
        }
      },
      (err) => {
        process.stdout.isTTY = oldTTY;
        completeCallback(err);
      });
  }

  private _copySnapshots(srcRoot: string, destRoot: string): void {
    const pattern: string = path.join(srcRoot, '**/__snapshots__/*.snap');
    globby.sync(pattern).forEach(snapFile => {
      const destination: string = snapFile.replace(srcRoot, destRoot);
      if (this._copyIfMatchExtension(snapFile, destination, '.test.tsx.snap')) {
        this.logVerbose(`Snapshot file ${snapFile} is copied to match extension ".test.tsx.snap".`);
      } else if (this._copyIfMatchExtension(snapFile, destination, '.test.ts.snap')) {
        this.logVerbose(`Snapshot file ${snapFile} is copied to match extension ".test.ts.snap".`);
      } else if (this._copyIfMatchExtension(snapFile, destination, '.test.jsx.snap')) {
        this.logVerbose(`Snapshot file ${snapFile} is copied to match extension ".test.jsx.snap".`);
      } else if (this._copyIfMatchExtension(snapFile, destination, '.test.js.snap')) {
        this.logVerbose(`Snapshot file ${snapFile} is copied to match extension ".test.js.snap".`);
      } else {
        this.logWarning(`Snapshot file ${snapFile} is not copied because don't find that matching test file.`);
      }
    });
  }

  private _copyIfMatchExtension(snapSourceFile: string, destinationFile: string, extension: string): boolean {
    const snapDestFile: string = destinationFile.replace(/\.test\..+\.snap$/, extension);
    const testFileName: string = path.basename(snapDestFile, '.snap');
    const testFile: string = path.resolve(path.dirname(snapDestFile), '..', testFileName); // Up from `__snapshots__`.
    if (FileSystem.exists(testFile)) {
      FileSystem.copyFile({
        sourcePath: snapSourceFile,
        destinationPath: snapDestFile
      });
      return true;
    } else {
      return false;
    }
  }
}