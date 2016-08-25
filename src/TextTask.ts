import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');

export interface ITextTaskConfig {
  textMatch?: string[];
}

export class TextTask extends GulpTask<ITextTaskConfig> {
  public name: string = 'text';
  public taskConfig: ITextTaskConfig = {
    textMatch: ['src/**/*.txt']
  };

  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream {
    /* tslint:disable:typedef */
    const merge = require('merge2');
    const texttojs = require('gulp-texttojs');
    const { textMatch } = this.taskConfig;
    const { libFolder, libAMDFolder } = this.buildConfig;
    /* tslint:enable:typedef */

    if (textMatch) {
      const commonJSTextStream: NodeJS.ReadWriteStream = gulp.src(textMatch)
        .pipe(texttojs({
          template: 'module.exports = <%= content %>;'
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
