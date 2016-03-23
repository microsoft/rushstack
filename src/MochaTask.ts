import { GulpTask } from 'gulp-core-build';

export interface IMochaTaskConfig {
  testMatch: string[];
}

export class MochaTask extends GulpTask<IMochaTaskConfig> {
  public name = 'mocha';

  public taskConfig: IMochaTaskConfig = {
    testMatch: ['lib/**/*.test.js']
  };

  public executeTask(gulp, completeCallback): any {
    let istanbul = require('gulp-istanbul');
    let mocha = require('gulp-mocha');
    let matchIndex = (process.argv.indexOf('--match'));
    let matchString = (matchIndex === -1) ? '' : process.argv[matchIndex + 1];

    return gulp.src(this.taskConfig.testMatch, { read: false })
      .pipe(mocha({
        grep: matchString
      }))
      .pipe(istanbul.writeReports());
  }
}
