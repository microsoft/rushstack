import { GulpTask } from './GulpTask';
import gulp = require('gulp');

export interface ICopyConfig {
  copyTo: {
    [destPath: string]: string[];
  };
}

export class CopyTask extends GulpTask<ICopyConfig> {
  public taskConfig: ICopyConfig = {
    copyTo: {}
  };

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback: (result?: Object) => void
  ): Promise<Object> | NodeJS.ReadWriteStream | void {

    /* tslint:disable:typedef */
    const flatten = require('gulp-flatten');
    const merge = require('merge2');
    const { copyTo } = this.taskConfig;
    /* tslint:enable:typedef */

    const allStreams: NodeJS.ReadWriteStream[] = [];

    for (const copyDest in copyTo) {
      if (copyTo.hasOwnProperty(copyDest)) {
        const sources: string[] = copyTo[copyDest];

        sources.forEach(sourceMatch => allStreams.push(
          gulp.src(sourceMatch)
            .pipe(flatten())
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

