import { GulpTask } from 'gulp-core-build';
import gulp = require('gulp');

export class ReloadTask extends GulpTask<{}> {
  public name: string = 'reload';

  public executeTask(gulp: gulp.Gulp, completeCallback?: (error?: string) => void): void {
    /* tslint:disable:typedef */
    const gulpConnect = require('gulp-connect');
    /* tslint:enable:typedef */

    gulp.src('')
        .pipe(gulpConnect.reload());

    completeCallback();
  }
}
