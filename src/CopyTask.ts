import { GulpTask } from './GulpTask';

export interface ICopyConfig {
  copyTo: {
    [destPath: string]: string[];
  };
}

export class CopyTask extends GulpTask<ICopyConfig> {

  public taskConfig: ICopyConfig = {
    copyTo: {}
  };

  public executeTask(gulp, completeCallback): any {
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

    return merge(allStreams);
  }
}

