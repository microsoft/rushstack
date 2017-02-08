import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');

export interface ITextTaskConfiguration {
  /**
   * Glob matches for files that should be converted into modules.
   */
  textMatch?: string[];
}

export class TextTask extends GulpTask<ITextTaskConfiguration> {
  public name: string = 'text';
  public taskConfiguration: ITextTaskConfiguration = {
    textMatch: ['src/**/*.txt']
  };

  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream {
    /* tslint:disable:typedef */
    const merge = require('merge2');
    const texttojs = require('gulp-texttojs');
    const { textMatch } = this.taskConfiguration;
    const { libFolder, libAMDFolder } = this.buildConfiguration;
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
