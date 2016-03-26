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
    let changed = require('gulp-changed');
    let merge = require('merge2');
    let errorCount = 0;
    let allStreams = [];

    let tsConfig = this.readJSONSync('tsconfig.json') || require('../tsconfig.json');
    let tsProject = this._tsProject = this._tsProject || ts.createProject(tsConfig.compilerOptions);
    let { libFolder, libAMDFolder } = this.buildConfig;
    let tsResult = gulp.src(this.taskConfig.sourceMatch)
      .pipe(plumber({
        errorHandler: function(error) {
          // console.log(error);
          errorCount++;
        }
      }))
      .pipe(changed(this.buildConfig.libFolder, { extension: '.js' }))
      .pipe(ts(tsProject, undefined, ts.reporter.longReporter()));

    allStreams.push(tsResult.js.pipe(gulp.dest(libFolder)));
    allStreams.push(tsResult.dts.pipe(gulp.dest(libFolder)));

    // Static passthrough files.
    allStreams.push(gulp.src(this.taskConfig.staticMatch)
      .pipe(gulp.dest(libFolder)));

    // If AMD modules are required, also build that.
    if (libAMDFolder) {
      let assign = require('object-assign');
      let tsAMDProject = ts.createProject(assign({}, tsConfig.compilerOptions, { module: 'amd' }));

      tsResult = gulp.src(this.taskConfig.sourceMatch)
        .pipe(plumber({
          errorHandler: function(error) {
            // console.log(error);
            errorCount++;
          }
        }))
        .pipe(changed(this.buildConfig.libFolder, { extension: '.js' }))
        .pipe(ts(tsAMDProject, undefined, ts.reporter.longReporter()));

      allStreams.push(tsResult.js.pipe(gulp.dest(libAMDFolder)));
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
