import {
  GulpTask
} from 'gulp-core-build';
import gulp = require('gulp');

export class ReloadTask extends GulpTask<{}> {
  public name = 'reload';

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback?: (result?: any) => void
  ): Promise<any> | NodeJS.ReadWriteStream | void {

    let gulpConnect = require('gulp-connect');

    gulp.src('')
      .pipe(gulpConnect.reload());

    completeCallback();
  }
}
