// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from './GulpTask';
import * as Gulp from 'gulp';
import { JsonObject } from '@rushstack/node-core-library';

/**
 * Configuration for CopyTask
 * @public
 */
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
 * @public
 */
export class CopyTask extends GulpTask<ICopyConfig> {
  /**
   * Instantiates a CopyTask with an empty configuration
   */
  public constructor() {
    super('copy', {
      copyTo: {},
      shouldFlatten: true,
    });
  }

  /**
   * Loads the z-schema object for this task
   */
  public loadSchema(): JsonObject {
    return require('./copy.schema.json');
  }

  /**
   * Executes the copy task, which copy files based on the task's Configuration
   */
  public executeTask(
    gulp: typeof Gulp,
    completeCallback: (error?: string | Error) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> | NodeJS.ReadWriteStream | void {
    /* eslint-disable */
    const flatten = require('gulp-flatten');
    const gulpif = require('gulp-if');
    const merge = require('merge2');
    /* eslint-enable */

    const { copyTo, shouldFlatten } = this.taskConfig;

    const allStreams: NodeJS.ReadWriteStream[] = [];

    for (const copyDest in copyTo) {
      if (copyTo.hasOwnProperty(copyDest)) {
        const sources: string[] = copyTo[copyDest];

        sources.forEach((sourceMatch) =>
          allStreams.push(
            gulp
              .src(sourceMatch, { allowEmpty: true })
              .pipe(gulpif(shouldFlatten, flatten()))
              .pipe(gulp.dest(copyDest))
          )
        );
      }
    }

    if (allStreams.length === 0) {
      completeCallback();
    } else {
      return merge(allStreams);
    }
  }
}
