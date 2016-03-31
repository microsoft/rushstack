import { GulpTask } from 'gulp-core-build';
import gulpType = require('gulp');
import ts = require('gulp-typescript');

interface ITypeScriptErrorObject {
  diagnostic: {
    messageText: string;
    code: number;
  };
  relativeFilename: string;
  message: string;
  startPosition: {
    character: number;
    line: number;
  };
}

export interface ITypeScriptTaskConfig {
  failBuildOnErrors: boolean;
  sourceMatch?: string[];
  staticMatch?: string[];
  reporter?: ts.Reporter;
}

export class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  public name = 'typescript';

  public taskConfig: ITypeScriptTaskConfig = {
    failBuildOnErrors: true,
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'typings/main/**/*.ts',
      'typings/main.d.ts'
    ],
    staticMatch: [
      'src/**/*.js',
      'src/**/*.jsx'
    ],
    reporter: {
      error: (error: ITypeScriptErrorObject) => {
        this.fileError(
          error.relativeFilename,
          error.startPosition.line,
          error.startPosition.character,
          `TS${error.diagnostic.code}`,
          error.diagnostic.messageText);
      }
    },
  };

  private _tsProject;

  public executeTask(gulp: gulpType.Gulp, completeCallback: (result?: any) => void) {
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
        errorHandler: function(error: any) {
          // console.log(error);
          errorCount++;
        }
      }))
      .pipe(sourcemaps.init())
      .pipe(ts(tsProject, undefined, this.taskConfig.reporter));

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
          errorHandler: function(error: any) {
            errorCount++;
          }
        }))
        .pipe(sourcemaps.write())
        .pipe(ts(tsAMDProject, undefined, this.taskConfig.reporter));

      allStreams.push(
        tsResult.js
          .pipe(sourcemaps.write('.'))
          .pipe(gulp.dest(libAMDFolder)));

      allStreams.push(tsResult.dts.pipe(gulp.dest(libAMDFolder)));
    }

    let mergedStream = merge(allStreams);

    return mergedStream;
  }
}
