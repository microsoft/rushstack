import { GulpTask } from './GulpTask';

export interface INukeConfig {
}

export class NukeTask extends GulpTask<INukeConfig> {

  public taskConfig: INukeConfig = {
  };

  public executeTask(gulp, completeCallback): any {
    let del = require('del');
    let buildConfig = this.buildConfig;

    del([
      buildConfig.distFolder,
      buildConfig.libAMDFolder,
      buildConfig.libFolder,
      buildConfig.tempFolder
    ].filter(path => !!path))
      .then(() => completeCallback())
      .catch((error) => completeCallback(error));
  }
}

