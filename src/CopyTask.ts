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

  public executeTask(gulp: gulp.Gulp, completeCallback: (result?: any) => void): Promise<any> | NodeJS.ReadWriteStream | void {
    let flatten = require('gulp-flatten');
    let merge = require('merge2');
    let { copyTo } = this.taskConfig;
    let allStreams = [];

    for (let copyDest in copyTo) {
      if (copyTo.hasOwnProperty(copyDest)) {
        let sources = copyTo[copyDest];

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

