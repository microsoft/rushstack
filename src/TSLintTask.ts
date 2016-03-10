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

    if (this.taskConfig.lintConfig) {
      return gulp.src(this.taskConfig.sourceMatch)
        .pipe(lint({
          configuration: this.taskConfig.lintConfig
        }))
        .pipe(lint.report('full', {
          emitError: false
        }));
    } else {
      completeCallback();
    }
  }
}
