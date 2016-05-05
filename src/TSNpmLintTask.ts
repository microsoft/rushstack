import gulp = require('gulp');
/* tslint:disable:typedef */
const tsdLinter = require('ts-npm-lint');
/* tslint:enable:typedef */

import {
  GulpTask
} from 'gulp-core-build';

export interface ITSNPMLintTaskConfig {
}

export class TSNpmLintTask extends GulpTask<ITSNPMLintTaskConfig> {
  public name: string = 'ts-npm-lint';

  public taskConfig: ITSNPMLintTaskConfig = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    tsdLinter.fixTypings();
  }
}
