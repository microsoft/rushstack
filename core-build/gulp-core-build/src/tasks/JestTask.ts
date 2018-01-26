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
   * The directory where Jest should store its cached information.
   */
  cacheDirectory?: string;

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
 * We need to replace the resolver function which jest is using until the PR which
 * fixes jest-resolves handling of symlinks is merged:
 * https://github.com/facebook/jest/pull/5085
 */
// tslint:disable-next-line:no-any
const nodeModulesPaths: any = require('jest-resolve/build/node_modules_paths');
nodeModulesPaths.default = (
  basedir: string,
  options: {
    moduleDirectory?: string[],
    paths?: string[]
  }
): string[] => {

  const nodeModulesFolders: string = 'node_modules';
  const absoluteBaseDir: string = path.resolve(basedir);
  const realAbsoluteBaseDir: string = fsx.realpathSync(absoluteBaseDir);
  const possiblePaths: string[] = [realAbsoluteBaseDir];

  let moduleFolders: string[] = [nodeModulesFolders];
  if (options && options.moduleDirectory) {
    moduleFolders = ([] as string[]).concat(options.moduleDirectory);
  }

  const windowsBaseRegex: RegExp = /^([A-Za-z]:)/;
  const fileshareBaseRegex: RegExp = /^\\\\/;
  let prefix: string = '/';
  if (windowsBaseRegex.test(absoluteBaseDir)) {
    prefix = '';
  } else if (fileshareBaseRegex.test(absoluteBaseDir)) {
    prefix = '\\\\';
  }

  let parsedPath: path.ParsedPath = path.parse(realAbsoluteBaseDir);
  while (parsedPath.dir !== possiblePaths[possiblePaths.length - 1]) {
    const realParsedDir: string = fsx.realpathSync(parsedPath.dir);
    possiblePaths.push(realParsedDir);
    parsedPath = path.parse(realParsedDir);
  }

  const dirs: string[] = possiblePaths.reduce((possibleDirs: string[], aPath: string) => {
    return possibleDirs.concat(
      moduleFolders.map((moduleDir: string) => {
        return path.join(prefix, aPath, moduleDir);
      })
    );
  }, []);

  if (options.paths) {
    return options.paths.concat(dirs);
  }
  return dirs;
};

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
 * @alpha
 */
export class JestTask extends GulpTask<IJestConfig> {

  constructor() {
    super('jest',
    {
      cache: true,
      collectCoverageFrom: ['lib/**/*.js?(x)', '!lib/**/test/**'],
      coverage: true,
      coverageReporters: ['json', 'html'],
      testPathIgnorePatterns: ['<rootDir>/(src|lib-amd|lib-es6|coverage|build|docs|node_modules)/']
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
      'config', 'jest', DEFAULT_JEST_CONFIG_FILE_NAME);

    this._copySnapshots(this.buildConfig.srcFolder, this.buildConfig.libFolder);

    // tslint:disable-next-line:no-any
    const jestConfig: any = {
      ci: this.buildConfig.production,
      cache: !!this.taskConfig.cache,
      config: fsx.existsSync(configFileFullPath) ? configFileFullPath : undefined,
      collectCoverageFrom: this.taskConfig.collectCoverageFrom,
      coverage: this.taskConfig.coverage,
      coverageReporters: this.taskConfig.coverageReporters,
      coverageDirectory: path.join(this.buildConfig.tempFolder, 'coverage'),
      maxWorkers: !!this.taskConfig.maxWorkers ?
        this.taskConfig.maxWorkers : 1,
      moduleDirectories: !!this.taskConfig.moduleDirectories ?
        this.taskConfig.moduleDirectories :
        ['node_modules', this.buildConfig.libFolder],
      reporters: [path.join(__dirname, 'JestReporter.js')],
      rootDir: this.buildConfig.rootPath,
      testMatch: !!this.taskConfig.testMatch ?
        this.taskConfig.testMatch : ['**/*.test.js?(x)'],
      testPathIgnorePatterns: this.taskConfig.testPathIgnorePatterns,
      updateSnapshot: !this.buildConfig.production
    };

    if (this.taskConfig.cacheDirectory) {
      // tslint:disable-next-line:no-string-literal
      jestConfig['cacheDirectory'] = this.taskConfig.cacheDirectory;
    }

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
    globby.sync(pattern).forEach(sourceFile => {
      const destination: string = sourceFile.replace(srcRoot, destRoot);
      fsx.copySync(sourceFile, destination);
    });
  }
}