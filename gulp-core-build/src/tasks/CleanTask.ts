import { GulpTask } from './GulpTask';
import gulp = require('gulp');

/**
 * The clean task is a special task which iterates through all registered
 * tasks and subtasks, collecting a list of patterns which should be deleted.
 * An instance of this task is automatically registered to the 'clean' command.
 */
export class CleanTask extends GulpTask<void> {
  /** Instantiates a new CleanTask with the name 'clean' */
  constructor() {
    super();
    this.name = 'clean';
  }

  /**
   * The main function, which iterates through all uniqueTasks registered
   * to the build, and by calling the getCleanMatch() function, collects a list of
   * glob patterns which are then passed to the `del` plugin to delete them from disk.
   */
  public executeTask(
    gulp: gulp.Gulp,
    completeCallback: (result?: Object) => void
  ): void {
    /* tslint:disable:typedef */
    const del = require('del');
    /* tslint:disable:typedef */

    const { distFolder, libFolder, libAMDFolder, tempFolder } = this.buildConfig;
    let cleanPaths = [
      distFolder,
      libAMDFolder,
      libFolder,
      tempFolder
    ];

    // Give each registered task an opportunity to add their own clean paths.
    for (const executable of this.buildConfig.uniqueTasks) {
      if (executable.getCleanMatch) {
        // Set the build config, as tasks need this to build up paths
        cleanPaths = cleanPaths.concat(executable.getCleanMatch(this.buildConfig));
      }
    }

    const uniquePaths: { [key: string]: string } = {};

    // Create dictionary of unique paths. (Could be replaced with ES6 set.)
    cleanPaths.forEach(path => {
      if (!!path) {
        uniquePaths[path] = path;
      }
    });

    // Reset cleanPaths to only unique non-empty paths.
    cleanPaths = [];
    for (const path in uniquePaths) {
      if (uniquePaths.hasOwnProperty(path)) {
        cleanPaths.push(path);
      }
    }

    del(cleanPaths)
      .then(() => completeCallback())
      .catch((error) => completeCallback(error));
  }
}
