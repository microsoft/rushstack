import {
  GulpTask
} from 'gulp-core-build';

export class ReloadTask extends GulpTask<{}> {
  public name = 'reload';

  public executeTask(gulp, completeCallback): any {
    let gulpConnect = require('gulp-connect');

    gulp.src('')
      .pipe(gulpConnect.reload());

    completeCallback();
  }
}
