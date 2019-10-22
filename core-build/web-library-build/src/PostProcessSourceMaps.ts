// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');

export class PostProcessSourceMaps extends GulpTask<void> {
  public constructor() {
    super('post-process');
  }

  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream | void {
    if (this.buildConfig.args.hasOwnProperty('vscode')) {

      // eslint-disable-next-line
      const replace = require('gulp-replace');

      return gulp.src(['dist/*!(.min).js.map'])
        .pipe(replace('webpack:///./', ''))
        .pipe(replace('webpack:////source/', ''))
        .pipe(replace('webpack:////src/', ''))
        .pipe(replace('webpack:///../~/', '../node_modules/'))
        .pipe(replace('"sourceRoot":""', '"sourceRoot":"/"'))
        .pipe(gulp.dest('dist/'));

    } else {
      return;
    }
  }
}