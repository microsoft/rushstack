import { GulpTask } from '@microsoft/gulp-core-build';
import gulp = require('gulp');
import * as gulpMocha from 'gulp-mocha';
import * as gulpIstanbul from 'gulp-istanbul';

export interface IMochaTaskConfiguration {
  testMatch: string[];
  reportDir: string;
}

export class MochaTask extends GulpTask<IMochaTaskConfiguration> {
  public name: string = 'mocha';

  public taskConfiguration: IMochaTaskConfiguration = {
    testMatch: ['lib/**/*.test.js'],
    reportDir: 'coverage'
  };

  public executeTask(gulp: gulp.Gulp, completeCallback?: (error?: string) => void): NodeJS.ReadWriteStream {
    const istanbul: typeof gulpIstanbul = require('gulp-istanbul');
    const mocha: typeof gulpMocha = require('gulp-mocha');

    /* tslint:disable:no-string-literal */
    const matchString: string = this.buildConfiguration.args['match'] as string;
    /* tslint:enable:no-string-literal */

    return gulp.src(this.taskConfiguration.testMatch, { read: false })
      .pipe(mocha({
        grep: matchString
      }))
      .pipe(istanbul.writeReports({
        dir: this.taskConfiguration.reportDir
      }));
  }
}
