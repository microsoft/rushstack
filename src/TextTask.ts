import {
  GulpTask
} from 'gulp-core-build';

export interface ITextTaskConfig {
  textMatch?: string[];
}

export class TextTask extends GulpTask<ITextTaskConfig> {
  public name = 'text';
  public taskConfig: ITextTaskConfig = {
    textMatch: ['src/**/*.txt']
  };

  public executeTask(gulp, completeCallback): any {
    let merge = require('merge2');
    let texttojs = require('gulp-texttojs');
    let { textMatch } = this.taskConfig;
    let { libFolder, libAMDFolder } = this.buildConfig;

    if (!textMatch) {
      completeCallback();
    } else {
      let commonJSTextStream = gulp.src(textMatch)
        .pipe(texttojs({
          template: 'module.exports = <%= content %>;',

        }))
        .pipe(gulp.dest(libFolder));

      if (libAMDFolder) {
        return merge(
          commonJSTextStream,
          gulp.src(textMatch)
            .pipe(texttojs())
            .pipe(gulp.dest(libAMDFolder))
        );
      } else {
        return commonJSTextStream;
      }
    }
  }

}
