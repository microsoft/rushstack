import gulp = require('gulp');

/* tslint:disable:max-line-length */
export class GulpProxy {
  private _gulp: gulp.Gulp;

  constructor(gulpInstance: any) {
    this._gulp = gulpInstance;
  }

  public task(): any {
    throw new Error(
      'You should not define gulp tasks, but instead subclass the GulpTask and override the executeTask method.'
    );
  }

  public src(glob: string | string[], opt?: gulp.SrcOptions): NodeJS.ReadWriteStream {
    return this._gulp.src(glob, opt);
  }

  public dest(outFolder: string | ((file: string) => string),
    opt?: gulp.DestOptions): NodeJS.ReadWriteStream {
    return this._gulp.dest(outFolder, opt);
  }

  public watch(glob: string | string[], fn: (gulp.WatchCallback | string)): NodeJS.EventEmitter {
    return this._gulp.watch(glob, fn);
  }
}
