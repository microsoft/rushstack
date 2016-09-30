import { GulpTask } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
import * as gulpIstanbul from 'gulp-istanbul';

export interface IInstrumentTaskConfig {
  coverageMatch: string[];
}

export class InstrumentTask extends GulpTask<IInstrumentTaskConfig> {
  public name: string = 'instrument';

  public taskConfig: IInstrumentTaskConfig = {
    coverageMatch: ['lib/**/*.js', '!lib/**/*.test.js']
  };

  public executeTask(gulp: gulp.Gulp, completeCallback?: (error?: string) => void): NodeJS.ReadWriteStream {
    const istanbul: typeof gulpIstanbul = require('gulp-istanbul');

    return gulp.src(this.taskConfig.coverageMatch)
      // Covering files
      .pipe(istanbul())
      // Force `require` to return covered files
      .pipe(istanbul.hookRequire())
      // Write the covered files to a temporary directory
      .pipe(gulp.dest(this.buildConfig.tempFolder));
  }
}
