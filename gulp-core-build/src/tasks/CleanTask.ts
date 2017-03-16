import { GulpTask } from './GulpTask';
import gulp = require('gulp');
import globby = require('globby');
import * as path from 'path';
import * as globEscape from 'glob-escape';

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

    // Appears to be a known issue with `del` whereby
    // if you ask to delete both a folder, and something in the folder,
    // it randomly chooses which one to delete first, which can cause
    // the function to fail sporadically. The fix for this is simple:
    // we need to remove any cleanPaths which exist under a folder we
    // are attempting to delete
    const fileMatches: string[] = globby.sync(cleanPaths);

    // First we sort the list of files. We know that if something is a file,
    // if matched, the parent folder should appear earlier in the list
    fileMatches.sort();

    if (fileMatches.length > 0) {
      // We need to determine which paths exist under other paths, and remove them from the
      // list of files to delete
      const filesToDelete: string[] = [];

      // current working directory
      let curDir = undefined;

      for (let i: number = 0; i < fileMatches.length; i++) {
        const curFile: string = fileMatches[i];
        if (this.isParentDirectory(curDir, curFile)) {
          continue;
        } else {
          filesToDelete.push(globEscape(curFile));
          curDir = curFile;
        }
      }

      del(filesToDelete)
        .then(() => completeCallback())
        .catch((error) => completeCallback(error));
    } else {
      completeCallback();
    }
  }

  private isParentDirectory(directory: string, filepath: string): boolean {
    if (!directory || !filepath) {
      return false;
    }

    const directoryParts: string[] = path.resolve(directory).split(path.sep);
    const fileParts: string[] = path.resolve(filepath).split(path.sep);

    if (directoryParts.length >= fileParts.length) {
      return false;
    }

    for (let i: number = 0; i < directoryParts.length; i++) {
      if (directoryParts[i] !== fileParts[i]) {
        return false;
      }
    }
    return true;
  }
}