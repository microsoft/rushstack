import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');

export class PostProcessSourceMaps extends GulpTask<{}> {
  public name: string = 'post-process';

  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream {
    if (this.buildConfig.args.hasOwnProperty('vscode')) {

      /* tslint:disable:typedef */
      const replace = require('gulp-replace');
      /* tslint:enable:typedef */

      return gulp.src(['dist/*!(.min).js.map'])
        .pipe(replace('webpack:///./', ''))
        .pipe(replace('webpack:////source/', ''))
        .pipe(replace('webpack:////src/', ''))
        .pipe(replace('webpack:///../~/', '../node_modules/'))
        .pipe(replace('"sourceRoot":""', '"sourceRoot":"/"'))
        .pipe(gulp.dest('dist/'));

    } else {
      return;
    }
  }
}