import { GulpTask } from 'gulp-core-build';
import gulpType = require('gulp');
import ts = require('gulp-typescript');

interface ITypeScriptErrorObject {
  diagnostic: {
    messageText:  string | { messageText: string };
    code: number;
  };
  fullFilename: string;
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
  public name: string = 'typescript';

  public taskConfig: ITypeScriptTaskConfig = {
    failBuildOnErrors: true,
    reporter: {
      error: (error: ITypeScriptErrorObject): void => {
        const errorMessage: string = (typeof error.diagnostic.messageText === 'object') ?
          (error.diagnostic.messageText as { messageText: string }).messageText :
          error.diagnostic.messageText as string;

        this.fileError(
          error.relativeFilename || error.fullFilename,
          error.startPosition.line,
          error.startPosition.character,
          `TS${error.diagnostic.code}`,
          errorMessage);
      }
    },
    sourceMatch: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'typings/main/**/*.ts',
      'typings/main.d.ts',
      'typings/tsd.d.ts',
      'typings/index.d.ts'
    ],
    staticMatch: [
      'src/**/*.js',
      'src/**/*.json',
      'src/**/*.jsx'
    ]
  };

  private _tsProject: ts.Project;

  public executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void {
    /* tslint:disable:typedef */
    const plumber = require('gulp-plumber');
    const sourcemaps = require('gulp-sourcemaps');
    const assign = require('object-assign');
    const merge = require('merge2');
    /* tslint:enable:typedef */

    let errorCount: number = 0;
    const allStreams: NodeJS.ReadWriteStream[] = [];
    const tsConfig: ts.TsConfig = this.readJSONSync('tsconfig.json') || require('../tsconfig.json');

    const tsCompilerOptions: ts.Params = assign({}, tsConfig.compilerOptions, {
      module: 'commonjs',
      sortOutput: true
    });

    const tsProject: ts.Project = this._tsProject = this._tsProject || ts.createProject(tsCompilerOptions);

    /* tslint:disable:typedef */
    const { libFolder, libAMDFolder } = this.buildConfig;
    /* tslint:enable:typedef */
    let tsResult: ts.CompilationStream = gulp.src(this.taskConfig.sourceMatch)
      .pipe(plumber({
        errorHandler: (): void => {
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
    const staticSrc: NodeJS.ReadWriteStream = gulp.src(this.taskConfig.staticMatch);

    allStreams.push(
      staticSrc.pipe(gulp.dest(libFolder)));

    // If AMD modules are required, also build that.
    if (libAMDFolder) {
      allStreams.push(
        staticSrc.pipe(gulp.dest(libAMDFolder)));

      const tsAMDProject: ts.Project = ts.createProject(assign({}, tsCompilerOptions, { module: 'amd' }));

      tsResult = gulp.src(this.taskConfig.sourceMatch)
        .pipe(plumber({
          errorHandler: (): void => {
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

    // Listen for pass/fail, and ensure that the task passes/fails appropriately.
    merge(allStreams)
      .on('queueDrain', () => {
        if (this.taskConfig.failBuildOnErrors && errorCount) {
          completeCallback('TypeScript error(s) occurred.');
        } else {
          completeCallback();
        }
      })
      .on('error', completeCallback);
  }
}
