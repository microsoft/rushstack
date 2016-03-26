import {
GulpTask
} from 'gulp-core-build';

export interface ITSLintTaskConfig {
  lintConfig?: any;
  sourceMatch?: string[];
}

export class TSLintTask extends GulpTask<ITSLintTaskConfig> {
  public name = 'tslint';
  public taskConfig: ITSLintTaskConfig = {
    lintConfig: require('../tslint.json'),
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'typings/tsd.d.ts'
    ]
  };

  public executeTask(gulp, completeCallback): any {
    let lint = require('gulp-tslint');
    let changed = require('gulp-changed');

    if (this.taskConfig.lintConfig) {
      return gulp.src(this.taskConfig.sourceMatch)
        .pipe(changed(this.buildConfig.libFolder, { extension: '.js' }))
        .pipe(lint({
          configuration: this.taskConfig.lintConfig
        }))
        .pipe(lint.report('full', {
          emitError: false
        }))
        .pipe(lint.report(touchFile));
    } else {
      completeCallback();
    }
  }
}

/** We need to touch any files that fail lint so that they're re-evaluated on incremental build. */
function touchFile(output, file, options) {
  'use strict';

  let touch = require('touch');

  touch.sync(file.path);
}