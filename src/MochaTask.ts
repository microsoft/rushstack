import { GulpTask } from 'gulp-core-build';

export interface IMochaTaskConfig {
  testMatch: string[];
}

export class MochaTask extends GulpTask<IMochaTaskConfig> {
  public name = 'mocha';

  public taskConfig: IMochaTaskConfig = {
     testMatch: [ 'lib/**/*.test.js']
  };

  public executeTask(gulp, completeCallback): any {
    let mocha = require('gulp-mocha');

    return gulp.src(this.taskConfig.testMatch, { read: false })
      .pipe(mocha());
  }
}
