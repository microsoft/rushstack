// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask, IBuildConfig } from '@microsoft/gulp-core-build';

import gulpType = require('gulp');
/* tslint:disable:typedef */
const md5 = require('md5');
const merge = require('lodash').merge;
/* tslint:enable:typedef */
import through2 = require('through2');
import gutil = require('gulp-util');
import * as fs from 'fs';
import * as TSLint from 'tslint';
import * as path from 'path';
import * as ts from 'typescript';

import {
  ITsConfigFile,
  TypeScriptConfiguration
} from './TypeScriptConfiguration';

export interface ITSLintRulesFile {
  rules?: { [name: string]: any }; /* tslint:disable-line:no-any */
}

export interface ITSLintTaskConfig {
  /**
   * A TsLint configuration objects
   */
  lintConfig?: ITSLintRulesFile;

  /**
   * Directories to search for custom linter rules
   */
  rulesDirectory?: string | string[];

  /**
   * An array of files which the linter should analyze
   */
  sourceMatch?: string[];

  /**
   * A function which reports errors to the proper location. Defaults to using the base GulpTask's
   * this.fileError() function.
    */
  reporter?: (result: TSLint.LintResult, file: gutil.File, options: ITSLintTaskConfig) => void;

  /**
   * If true, displays warnings as errors. If the reporter function is overwritten, it should reference
   * this flag. Defaults to `false`.
   */
  displayAsWarning?: boolean;

  /**
   * If true, the lintConfig rules which were previously set will be removed. This flag is useful
   * for ensuring that there are no rules activated from previous calls to setConfig(). Default is 'false'.
   */
  removeExistingRules?: boolean;

  /**
   * If false, does not use a default tslint configuration as the basis for creating the list of active rules.
   * Defaults to 'true'
   */
  useDefaultConfigAsBase?: boolean;
}

export class TSLintTask extends GulpTask<ITSLintTaskConfig> {
  private _defaultLintRules: any = undefined; // tslint:disable-line:no-any

  constructor() {
    super(
      'tslint',
      {
        lintConfig: {},
        reporter: (result: TSLint.LintResult, file: gutil.File, options: ITSLintTaskConfig): void => {
          for (const failure of result.failures) {
            const pathFromRoot: string = path.relative(this.buildConfig.rootPath, file.path);

            const start: ts.LineAndCharacter = failure.getStartPosition().getLineAndCharacter();
            if (this.taskConfig.displayAsWarning) {
              this.fileWarning(
                pathFromRoot,
                start.line + 1,
                start.character + 1,
                failure.getRuleName(),
                failure.getFailure());
            } else {
              this.fileError(
                pathFromRoot,
                start.line + 1,
                start.character + 1,
                failure.getRuleName(),
                failure.getFailure());
            }
          }
        },
        rulesDirectory: ((): string[] => {
          const msCustomRulesMain: string = require.resolve('tslint-microsoft-contrib');
          const msCustomRulesDirectory: string = path.dirname(msCustomRulesMain);
          return TSLint.Configuration.getRulesDirectories([msCustomRulesDirectory], __dirname);
        })(),
        sourceMatch: [
          'src/**/*.ts',
          'src/**/*.tsx'
        ],
        removeExistingRules: false,
        useDefaultConfigAsBase: true
      }
    );
  }

  public mergeConfig(config: ITSLintTaskConfig): void {
    this._prepareUpdateConfig(config);
    super.mergeConfig(config);
  }

  public setConfig(config: ITSLintTaskConfig): void {
    this._prepareUpdateConfig(config);
    super.setConfig(config);
  }

  public loadSchema(): Object {
    return require('./schemas/tslint.schema.json');
  }

  public executeTask(gulp: gulpType.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream | void {
    const self: TSLintTask = this;

    if (!this.taskConfig.sourceMatch) {
      completeCallback('taskConfig.sourceMatch must be defined');
      return;
    }

    if (!this.taskConfig.reporter) {
      completeCallback('taskConfig.reporter must be defined');
      return;
    }

    const lintRulesFile: ITSLintRulesFile = self._loadLintConfiguration();

    // Write out the active lint rules for easier debugging
    if (!fs.existsSync(path.dirname(this._getTsLintFilepath()))) {
      fs.mkdirSync(path.dirname(this._getTsLintFilepath()));
    }

    fs.writeFileSync(this._getTsLintFilepath(), JSON.stringify(lintRulesFile, undefined, 2));

    const cached = require('gulp-cache'); // tslint:disable-line

    let program: ts.Program | undefined = undefined;
    try {
      const tsconfigFileData: ITsConfigFile<Object> = TypeScriptConfiguration.getTsConfigFile(this.buildConfig);
      const tsconfigFilePath: string =
        path.join(
          this.buildConfig.rootPath,
          this.buildConfig.tempFolder,
          'tslint-tsconfig.json'
        );
      fs.writeFileSync(tsconfigFilePath, JSON.stringify(tsconfigFileData, undefined, 2));

      program = TSLint.Linter.createProgram(
        tsconfigFilePath,
        path.join(this.buildConfig.rootPath, this.buildConfig.srcFolder)
      );
    } catch (e) {
      this.logWarning(`Unable to create a TS program for TSLint. Some lint rules might not work correctly. Error ${e}`);
    }

    return gulp.src(this.taskConfig.sourceMatch)
      .pipe(cached(
        through2.obj(function (
          file: gutil.File,
          encoding: string,
          callback: (encoding?: string, file?: gutil.File) => void): void {
          self.logVerbose(file.path);

          // Lint the file
          if (file.isNull()) {
            return callback(undefined, file);
          }

          // Stream is not supported
          if (file.isStream()) {
            this.emit('error', new gutil.PluginError(this.name, 'Streaming not supported'));
            return callback();
          }

          const options: TSLint.ILinterOptions = {
            fix: false,
            formatter: 'json',
            formattersDirectory: undefined, // not used, use reporters instead
            rulesDirectory: self.taskConfig.rulesDirectory || []
          };

          const linter: TSLint.Linter = new TSLint.Linter(options, program);

          const configuration: TSLint.Configuration.IConfigurationFile =
            TSLint.Configuration.parseConfigFile(lintRulesFile);
          linter.lint(file.path, file.contents!.toString(), configuration);

          const result: TSLint.LintResult = linter.getResult();

          /* tslint:disable:no-string-literal */
          file['tslint'] = result;
          /* tslint:enable:no-string-literal */

          // We can't get here if reporter is undefined
          if (result.errorCount > 0 && self.taskConfig.reporter) {
            self.taskConfig.reporter(result, file, self.taskConfig);
          }

          this.push(file);
          callback();
        }), {
          // Scope the cache to a combination of the lint rules and the build path
          name: md5(
            TSLint.Linter.VERSION + JSON.stringify(lintRulesFile) +
            self.name + self.buildConfig.rootPath),
          // What on the result indicates it was successful
          success: (jshintedFile: gutil.File): boolean => {
            /* tslint:disable:no-string-literal */
            return jshintedFile['tslint'].failureCount === 0;
            /* tslint:enable:no-string-literal */
          },
          // By default, the cache attempts to store the value of the objects in the stream
          // For this task, this is over-engineering since we never need to store anything extra.
          value: (file: gutil.File): Object => {
            return {
              path: file.path
            };
          }
        }
      ));
  }

  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: ITSLintTaskConfig = this.taskConfig): string[] {
    return [path.join(buildConfig.rootPath, buildConfig.tempFolder)];
  }

  private _prepareUpdateConfig(newConfig: ITSLintTaskConfig): void {
    // If the removeExistingRules flag is set, clear out any existing rules
    if (newConfig.removeExistingRules &&
        this.taskConfig &&
        this.taskConfig.lintConfig) {
      delete this.taskConfig.lintConfig.rules;
      delete newConfig.removeExistingRules;
    }
  }

  private _getTsLintFilepath(): string {
    return path.join(this.buildConfig.rootPath, this.buildConfig.tempFolder, 'tslint.json');
  }

  private _loadLintConfiguration(): ITSLintRulesFile { // tslint:disable-line:no-any
    if (!this._defaultLintRules) {
      this._defaultLintRules = require('./defaultTslint.json');
    }

    return merge(
      (this.taskConfig.useDefaultConfigAsBase ? this._defaultLintRules : {}),
      this.taskConfig.lintConfig || {});
  }
}
