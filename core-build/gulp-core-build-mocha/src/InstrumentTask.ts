// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask, IBuildConfig } from '@microsoft/gulp-core-build';
import * as Gulp from 'gulp';
import * as gulpIstanbul from 'gulp-istanbul';

export interface IInstrumentTaskConfig {
  coverageMatch: string[];
}

export class InstrumentTask extends GulpTask<IInstrumentTaskConfig> {
  constructor() {
    super(
      'instrument',
      {
        coverageMatch: ['lib/**/*.js', '!lib/**/*.test.js']
      }
    );
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (
      super.isEnabled(buildConfig) &&
      !buildConfig.jestEnabled
    );
  }

  public executeTask(gulp: typeof Gulp, completeCallback?: (error?: string) => void): NodeJS.ReadWriteStream {
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
