export class GulpProxy {
  private _gulp: any;

  constructor(gulpInstance: any) {
    this._gulp = gulpInstance;
  }

  public task(): any {
    throw 'You should not define gulp tasks, but instead subclass the GulpTask and override the executeTask method.';
  }

  public src() {
    return this._gulp.src.apply(this._gulp, arguments);
  }

  public dest() {
    return this._gulp.dest.apply(this._gulp, arguments);
  }

  public watch() {
    return this._gulp.watch.apply(this._gulp, arguments);
  }
}
