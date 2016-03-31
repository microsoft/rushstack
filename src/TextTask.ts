import { GulpTask } from 'gulp-core-build';
import gulpType = require('gulp');

export interface ITextTaskConfig {
  textMatch?: string[];
}

export class TextTask extends GulpTask<ITextTaskConfig> {
  public name = 'text';
  public taskConfig: ITextTaskConfig = {
    textMatch: ['src/**/*.txt']
  };

  public executeTask(gulp: gulpType.Gulp) {
    let merge = require('merge2');
    let texttojs = require('gulp-texttojs');
    let { textMatch } = this.taskConfig;
    let { libFolder, libAMDFolder } = this.buildConfig;

    if (textMatch) {
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
