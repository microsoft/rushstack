import {
GulpTask
} from 'gulp-core-build';

export interface ITypeScriptTaskConfig {
  failBuildOnErrors: boolean;
  sourceMatch?: string[];
  staticMatch?: string[];
}

export class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  public name = 'typescript';

  public taskConfig: ITypeScriptTaskConfig = {
    failBuildOnErrors: true,
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'typings/tsd.d.ts'
    ],
    staticMatch: [
      'src/**/*.js',
      'src/**/*.jsx'
    ]
  };

  private _tsProject;

  public executeTask(gulp, completeCallback): any {
    let ts = require('gulp-typescript');
    let plumber = require('gulp-plumber');
    let sourcemaps = require('gulp-sourcemaps');
    let assign = require('object-assign');
    let merge = require('merge2');
    let errorCount = 0;
    let allStreams = [];
    let tsConfig = this.readJSONSync('tsconfig.json') || require('../tsconfig.json');

    let tsCompilerOptions = assign({}, tsConfig.compilerOptions, {
      sortOutput: true,
      module: 'commonjs'
    });

    let tsProject = this._tsProject = this._tsProject || ts.createProject(tsCompilerOptions);

    let { libFolder, libAMDFolder } = this.buildConfig;
    let tsResult = gulp.src(this.taskConfig.sourceMatch)
      .pipe(plumber({
        errorHandler: function(error) {
          // console.log(error);
          errorCount++;
        }
      }))
      .pipe(sourcemaps.init())
      .pipe(ts(tsProject, undefined, ts.reporter.longReporter()));

    allStreams.push(tsResult.js
      .pipe(sourcemaps.write('.'))
      .pipe(gulp.dest(libFolder)));

    allStreams.push(tsResult.dts.pipe(gulp.dest(libFolder)));

    // Static passthrough files.
    let staticSrc = gulp.src(this.taskConfig.staticMatch);

    allStreams.push(
      staticSrc.pipe(gulp.dest(libFolder)));

    // If AMD modules are required, also build that.
    if (libAMDFolder) {
      allStreams.push(
        staticSrc.pipe(gulp.dest(libAMDFolder)));

      let tsAMDProject = ts.createProject(assign({}, tsCompilerOptions, { module: 'amd' }));

      tsResult = gulp.src(this.taskConfig.sourceMatch)
        .pipe(plumber({
          errorHandler: function(error) {
            errorCount++;
          }
        }))
        .pipe(sourcemaps.write())
        .pipe(ts(tsAMDProject, undefined, ts.reporter.longReporter()));

      allStreams.push(
        tsResult.js
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(libAMDFolder)));

      allStreams.push(tsResult.dts.pipe(gulp.dest(libAMDFolder)));
    }

    let mergedStream = merge(allStreams);

    mergedStream
      .on('queueDrain', () => {
        if (this.taskConfig.failBuildOnErrors && errorCount) {
          completeCallback('TypeScript error(s) occured.');
        } else {
          completeCallback();
        }
      })
      .on('error', completeCallback);

    return mergedStream;
  }
}
