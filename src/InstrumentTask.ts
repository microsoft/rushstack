import { GulpTask } from 'gulp-core-build';

export interface IInstrumentTaskConfig {
  coverageMatch: string[];
}

export class InstrumentTask extends GulpTask<IInstrumentTaskConfig> {
  public name = 'instrument';

  public taskConfig: IInstrumentTaskConfig = {
    coverageMatch: ['lib/**/*.js', '!lib/**/*.test.js']
  };

  public executeTask(gulp, completeCallback): any {
    let istanbul = require('gulp-istanbul');

    return gulp.src(this.taskConfig.coverageMatch)
      // Covering files
      .pipe(istanbul())
      // Force `require` to return covered files
      .pipe(istanbul.hookRequire())
      // Write the covered files to a temporary directory
      .pipe(gulp.dest(this.buildConfig.tempFolder));
  }
}
