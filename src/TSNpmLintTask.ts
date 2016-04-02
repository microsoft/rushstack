import gulp = require('gulp');
const tsdLinter = require('ts-npm-lint');

import {
  GulpTask
} from 'gulp-core-build';

export interface ITSNPMLintTaskConfig {
}

export class TSNpmLintTask extends GulpTask<ITSNPMLintTaskConfig> {
  public name = 'ts-npm-lint';

  public taskConfig: ITSNPMLintTaskConfig = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    tsdLinter.fixTypings();
  }
}
