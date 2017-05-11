import { GulpTask } from './GulpTask';
import gulp = require('gulp');

/** Configuration for CopyTask */
export interface ICopyConfig {
  /**
   * The list of patterns and the destination which where they should be copied
   */
  copyTo: {
    /**
     * A mapping of destination paths (absolute or relative) to a list of glob pattern matches
     */
    [destPath: string]: string[];
  };

  /**
   * If true, the files will be copied into a flattened folder. If false, they will retain the original
   * folder structure. True by default.
   */
  shouldFlatten?: boolean;
}

/**
 * This task takes in a map of dest: [sources], and copies items from one place to another.
 */
export class CopyTask extends GulpTask<ICopyConfig> {
  /**
   * Instantiates a CopyTask with an empty configuration
   */
  constructor() {
    super();

    this.name = 'copy';

    this.taskConfig = {
      copyTo: {},
      shouldFlatten: true
    };
  }

  /**
   * Loads the z-schema object for this task
   * @internal
   */
  public loadSchema(): Object {
    return require('./copy.schema.json');
  };

  /**
   * Executes the copy task, which copy files based on the task's Configuration
   */
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
