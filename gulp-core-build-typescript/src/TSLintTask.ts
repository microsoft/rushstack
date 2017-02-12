import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');
/* tslint:disable:typedef */
const md5 = require('md5');
const merge = require('lodash').merge;
/* tslint:enable:typedef */
import through2 = require('through2');
import gutil = require('gulp-util');
import * as TSLint from 'tslint';
import * as path from 'path';
import * as ts from 'typescript';

export interface ITSLintTaskConfiguration {
  /**
   * A TsLint configuration objects
   */
  lintConfiguration?: any; /* tslint:disable-line:no-any */

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
  reporter?: (result: TSLint.LintResult, file: gutil.File, options: ITSLintTaskConfiguration) => void;

  /**
   * If true, displays warnings as errors. If the reporter function is overwritten, it should reference
   * this flag. Defaults to `false`.
   */
  displayAsWarning?: boolean;

  /**
   * If true, the lintConfiguration rules which were previously set will be removed. This flag is useful
   * for ensuring that there are no rules activated from previous calls to setConfiguration(). Default is 'false'.
   */
  removeExistingRules?: boolean;

  /**
   * If false, does not use a default tslint configuration as the basis for creating the list of active rules.
   * Defaults to 'true'
   */
  useDefaultConfigurationAsBase?: boolean;
}

export class TSLintTask extends GulpTask<ITSLintTaskConfiguration> {
  public name: string = 'tslint';
  public taskConfiguration: ITSLintTaskConfiguration = {
    // lintConfiguration: require('../lib/defaultTslint.json'),
    lintConfiguration: {},
    reporter: (result: TSLint.LintResult, file: gutil.File, options: ITSLintTaskConfiguration): void => {
      for (const failure of result.failures) {
        const pathFromRoot: string = path.relative(this.buildConfiguration.rootPath, file.path);

        const start: ts.LineAndCharacter = failure.getStartPosition().getLineAndCharacter();
        if (this.taskConfiguration.displayAsWarning) {
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
      return TSLint.Configuration.getRulesDirectories([ msCustomRulesDirectory ], __dirname);
    })(),
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx'
    ],
    removeExistingRules: false,
    useDefaultConfigurationAsBase: true
  };

  /* tslint:disable:no-any */
  private _defaultLintRules: any = undefined;
  /* tslint:enable:no-any */

  public setConfiguration(configuration: ITSLintTaskConfiguration): void {
    // If the removeExistingRules flag is set, clear out any existing rules
    if (configuration.removeExistingRules &&
        this.taskConfiguration &&
        this.taskConfiguration.lintConfiguration) {
      delete this.taskConfiguration.lintConfiguration.rules;
      delete configuration.removeExistingRules;
    }

    super.setConfiguration(configuration);
  }

  public loadSchema(): Object {
    return require('./schemas/tslint.schema.json');
  }

  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream {
    const taskScope: TSLintTask = this;

    const activeLintRules: any = taskScope._loadLintRules(); // tslint:disable-line:no-any
    const cached = require('gulp-cache'); // tslint:disable-line

    return gulp.src(this.taskConfiguration.sourceMatch)
      .pipe(cached(
        through2.obj(function(
          file: gutil.File,
          encoding: string,
          callback: (encoding?: string, file?: gutil.File) => void): void {
          taskScope.logVerbose(file.path);

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
            rulesDirectory: taskScope.taskConfiguration.rulesDirectory || []
          };

          const linter: TSLint.Linter = new TSLint.Linter(options);

          linter.lint(file.relative, file.contents.toString(), activeLintRules);

          const result: TSLint.LintResult = linter.getResult();

          /* tslint:disable:no-string-literal */
          file['tslint'] = result;
          /* tslint:enable:no-string-literal */

          if (result.failureCount > 0) {
            taskScope.taskConfiguration.reporter(result, file, taskScope.taskConfiguration);
          }

          this.push(file);
          callback();
        }), {
          // Scope the cache to a combination of the lint rules and the build path
          name: md5(
            TSLint.Linter.VERSION + JSON.stringify(activeLintRules) +
            taskScope.name + taskScope.buildConfiguration.rootPath),
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

  private _loadLintRules(): any { // tslint:disable-line:no-any
    if (!this._defaultLintRules) {
      this._defaultLintRules = require('./defaultTslint.json');
    }
    return merge(
      (this.taskConfiguration.useDefaultConfigurationAsBase ? this._defaultLintRules : {}),
      this.taskConfiguration.lintConfiguration || {});
  }
}
