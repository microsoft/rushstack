import { GulpTask } from 'gulp-core-build';
import gulpType = require('gulp');
import through2 = require('through2');
import gutil = require('gulp-util');
import tslint = require('tslint');
import * as path from 'path';
import * as lintTypes from 'tslint/lib/lint';

export interface ITSLintTaskConfig {
  lintConfig?: any;
  rulesDirectory?: string;
  sourceMatch?: string[];
  reporter?: (result: lintTypes.LintResult, file: gutil.File, options: ITSLintTaskConfig) => void;
}

export class TSLintTask extends GulpTask<ITSLintTaskConfig> {
  public name = 'tslint';
  public taskConfig: ITSLintTaskConfig = {
    lintConfig: require('../lib/tslint.json'),
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'typings/tsd.d.ts'
    ],
    reporter: (result: lintTypes.LintResult, file: gutil.File, options: ITSLintTaskConfig) => {
      for (let failure of result.failures) {
        let pathFromRoot = path.relative(this.buildConfig.rootPath, file.path);

        let start = failure.getStartPosition().getLineAndCharacter();
        this.fileError(
          pathFromRoot,
          start.line + 1,
          start.character + 1,
          failure.getRuleName(),
          failure.getFailure());
      }
    }
  };

  public executeTask(gulp: gulpType.Gulp) {
    let touch = require('touch');
    let taskScope = this;

    if (this.taskConfig.lintConfig) {
      return gulp.src(this.taskConfig.sourceMatch)
        .pipe(through2.obj(function(
          file: gutil.File,
          encoding: string,
          callback: (encoding?: string, file?: gutil.File) => void) {
          // Lint the file
          if (file.isNull()) {
            return callback(null, file);
          }

          // Stream is not supported
          if (file.isStream()) {
            this.emit('error', new gutil.PluginError(this.name, 'Streaming not supported'));
            return callback();
          }

          let options = {
            formatter: 'json',
            configuration: taskScope.taskConfig.lintConfig,
            rulesDirectory: taskScope.taskConfig.rulesDirectory || null,
            formattersDirectory: null // not used, use reporters instead
          };

          let tslintOutput = new tslint(file.relative, (<any>file.contents).toString('utf8'), options);
          /* tslint:disable:no-string-literal */
          let result = file['tslint'] = tslintOutput.lint();
          /* tslint:enable:no-string-literal */

          if (result.failureCount > 0) {
            taskScope.taskConfig.reporter(result, file, taskScope.taskConfig);

            // Touch all errored files
            touch.sync(file.path);
          }

          this.push(file);
          callback();
        }));
    }
  }
}
