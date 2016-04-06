import { GulpTask } from './GulpTask';
import gulp = require('gulp');

export interface INukeConfig {
}

export class NukeTask extends GulpTask<INukeConfig> {
  public name = 'nuke';

  public taskConfig: INukeConfig = {
  };

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback: (result?: any) => void
  ): Promise<any> | NodeJS.ReadWriteStream | void {
    let del = require('del');
    let { distFolder, libFolder, libAMDFolder, tempFolder } = this.buildConfig;
    let nukePaths = [
      distFolder,
      libAMDFolder,
      libFolder,
      tempFolder
    ];

    // Give each registered task an opportunity to add their own nuke paths.
    for (let executable of this.buildConfig.uniqueTasks) {
      if (executable.getNukeMatch) {
        nukePaths = nukePaths.concat(executable.getNukeMatch());
      }
    }

    let uniquePaths = {};

    // Create dictionary of unique paths. (Could be replaced with ES6 set.)
    nukePaths.forEach(path => {
      if (!!path) {
        uniquePaths[path] = path;
      }
    });

    // Reset nukePaths to only unique non-empty paths.
    nukePaths = [];
    for (let path in uniquePaths) {
      if (uniquePaths.hasOwnProperty(path)) {
        nukePaths.push(path);
      }
    }

    del(nukePaths)
      .then(() => completeCallback())
      .catch((error) => completeCallback(error));
  }
}
