import {
GulpTask
} from 'gulp-core-build';

export interface ITSLintTaskConfig {
  sourceMatch?: string[];
}

export class TSLintTask extends GulpTask<ITSLintTaskConfig> {
  public name = 'tslint';
  public taskConfig: ITSLintTaskConfig = {
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'typings/tsd.d.ts'
    ]
  };

  public executeTask(gulp, completeCallback): any {
    let lint = require('gulp-tslint');

    return gulp.src(this.taskConfig.sourceMatch)
      .pipe(lint({
        configuration: this.readJSONSync('tslint.json') || require('../tslint.json')
      }))
      .pipe(lint.report('full', {
        emitError: false
      }));
  }
}
