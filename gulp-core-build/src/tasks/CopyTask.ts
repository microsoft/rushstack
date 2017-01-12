import { GulpTask } from './GulpTask';
import gulp = require('gulp');

export interface ICopyConfig {
  /**
   * Object of dest: [source] for the copy task.
   */
  copyTo: {
    [destPath: string]: string[];
  };

  /**
   * Whether to remove or replace relative path for files. True by default.
   */
  shouldFlatten?: boolean;
}

/**
 * This task takes in a map of dest: [sources], and copies items from one place to another.
 */
export class CopyTask extends GulpTask<ICopyConfig> {
  public taskConfig: ICopyConfig = {
    copyTo: {},
    shouldFlatten: true
  };

  public loadSchema(): Object {
    return require('./copy.schema.json');
  };

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback: (result?: Object) => void
  ): Promise<Object> | NodeJS.ReadWriteStream | void {

    /* tslint:disable:typedef */
    const flatten = require('gulp-flatten');
    const gulpif = require('gulp-if');
    const merge = require('merge2');
    const { copyTo, shouldFlatten } = this.taskConfig;
    /* tslint:enable:typedef */

    const allStreams: NodeJS.ReadWriteStream[] = [];

    for (const copyDest in copyTo) {
      if (copyTo.hasOwnProperty(copyDest)) {
        const sources: string[] = copyTo[copyDest];

        sources.forEach(sourceMatch => allStreams.push(
          gulp.src(sourceMatch)
            .pipe(gulpif(shouldFlatten, flatten()))
            .pipe(gulp.dest(copyDest))
        ));
      }
    }

    if (allStreams.length === 0) {
      completeCallback();
    } else {
      return merge(allStreams);
    }
  }
}
