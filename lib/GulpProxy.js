var GulpProxy = (function () {
    function GulpProxy(gulpInstance) {
        this._gulp = gulpInstance;
    }
    GulpProxy.prototype.task = function () {
        throw 'You should not define gulp tasks, but instead subclass the GulpTask and override the executeTask method.';
    };
    GulpProxy.prototype.src = function () {
        return this._gulp.src.apply(this._gulp, arguments);
    };
    GulpProxy.prototype.dest = function () {
        return this._gulp.dest.apply(this._gulp, arguments);
    };
    return GulpProxy;
})();
exports.GulpProxy = GulpProxy;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = GulpProxy;
