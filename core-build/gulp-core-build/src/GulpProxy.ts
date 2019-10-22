// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import gulp = require('gulp');
import Orchestrator = require('orchestrator');

/**
 * A helper utility for gulp which can be extended to provide additional features to gulp vinyl streams
 */
export class GulpProxy extends Orchestrator {
  public src: gulp.SrcMethod;
  public dest: gulp.DestMethod;
  public watch: gulp.WatchMethod;

  public constructor(gulpInstance: gulp.Gulp) {
    super();
    this.src = gulpInstance.src;
    this.dest = gulpInstance.dest;
    this.watch = gulpInstance.watch;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public task(): any {
    throw new Error(
      'You should not define gulp tasks directly, but instead subclass the GulpTask or call subTask(), and register it to gulp-core-build.'
    );
  }
}
