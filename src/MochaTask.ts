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
    const matchIndex = (process.argv.indexOf('--match'));
    const matchString = (matchIndex === -1) ? '' : process.argv[matchIndex + 1];

    return gulp.src(this.taskConfig.testMatch, { read: false })
      .pipe(mocha({
        grep: matchString
      }))
      .pipe(istanbul.writeReports());
  }
}
