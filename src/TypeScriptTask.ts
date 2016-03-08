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

  public executeTask(gulp, completeCallback): any {
    let ts = require('gulp-typescript');
    let plumber = require('gulp-plumber');
    let merge = require('merge2');
    let errorCount = 0;
    let allStreams = [];

    let tsConfig = this.readJSONSync('tsconfig.json') || require('../tsconfig.json');
    let tsProject = ts.createProject(tsConfig.compilerOptions);
    let { libFolder } = this.buildConfig;

    let tsResult = gulp.src(this.taskConfig.sourceMatch)
      .pipe(plumber({
        errorHandler: function(error) {
          // console.log(error);
          errorCount++;
        }
      }))
      .pipe(ts(tsProject, undefined, ts.reporter.longReporter()));

    allStreams.push(tsResult.js.pipe(gulp.dest(libFolder)));
    allStreams.push(tsResult.dts.pipe(gulp.dest(libFolder)));

    // Static passthrough files.
    allStreams.push(gulp.src(this.taskConfig.staticMatch)
      .pipe(gulp.dest(libFolder)));

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
