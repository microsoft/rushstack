import { GulpTask } from 'gulp-core-build';
import gulp = require('gulp');

export interface IMochaTaskConfig {
  testMatch: string[];
}

export class MochaTask extends GulpTask<IMochaTaskConfig> {
  public name = 'mocha';

  public taskConfig: IMochaTaskConfig = {
    testMatch: ['lib/**/*.test.js']
  };

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback?: (result?: any) => void
  ): Promise<any> | NodeJS.ReadWriteStream | void {

    const istanbul = require('gulp-istanbul');
    const mocha = require('gulp-mocha');

    /* tslint:disable:no-string-literal */
    const matchString = this.buildConfig.args['match'];
    /* tslint:enable:no-string-literal */

    return gulp.src(this.taskConfig.testMatch, { read: false })
      .pipe(mocha({
        grep: matchString
      }))
      .pipe(istanbul.writeReports());
  }
}
