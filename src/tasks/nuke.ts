/// <reference path="../../typings/tsd" />

import { INukeOptions } from '../options/nuke';

export default class BundleTasks { // implements ITaskGroup {

  public static registerTasks(build: any, options: INukeOptions) {
    let paths = options.paths;
    let del = require('del');

    build.task('nuke', (cb) => {
      return del([
        paths.libFolder,
        paths.coverageFolder
      ]);
    });
  }
}
