import { GulpTask } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
import * as gulpIstanbul from 'gulp-istanbul';

export interface IInstrumentTaskConfiguration {
  coverageMatch: string[];
}

export class InstrumentTask extends GulpTask<IInstrumentTaskConfiguration> {
  public name: string = 'instrument';

  public taskConfiguration: IInstrumentTaskConfiguration = {
    coverageMatch: ['lib/**/*.js', '!lib/**/*.test.js']
  };

  public executeTask(gulp: gulp.Gulp, completeCallback?: (error?: string) => void): NodeJS.ReadWriteStream {
    const istanbul: typeof gulpIstanbul = require('gulp-istanbul');

    return gulp.src(this.taskConfiguration.coverageMatch)
      // Covering files
      .pipe(istanbul())
      // Force `require` to return covered files
      .pipe(istanbul.hookRequire())
      // Write the covered files to a temporary directory
      .pipe(gulp.dest(this.buildConfiguration.tempFolder));
  }
}
