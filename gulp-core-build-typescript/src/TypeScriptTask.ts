import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');
import ts = require('gulp-typescript');

interface ITypeScriptErrorObject {
  diagnostic: {
    messageText: string | { messageText: string };
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
  /**
   * Fails the build when errors occur.
   * @default true
   */
  failBuildOnErrors: boolean;

  /**
   * Glob matches for files to be included in the build.
   */
  sourceMatch?: string[];

  /**
   * Glob matches for files to be passed through the build.
   */
  staticMatch?: string[];

  /**
   * Optional override for a custom reporter object to be passed into the TypeScript compiler.
   */
  reporter?: ts.Reporter;

  /**
   * Optional override for the TypeScript compiler.
   */
  /* tslint:disable:no-any */
  typescript?: any;
  /* tslint:enable:no-any */
}

export class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  public name: string = 'typescript';

  public taskConfig: ITypeScriptTaskConfig = {
    failBuildOnErrors: true,
    reporter: {
      error: (error: ITypeScriptErrorObject): void => {
        const filename: string = error.relativeFilename || error.fullFilename;
        const line: number = error.startPosition ? error.startPosition.line : 0;
        const character: number = error.startPosition ? error.startPosition.character : 0;
        const code: number = error.diagnostic.code;
        const errorMessage: string = (typeof error.diagnostic.messageText === 'object') ?
          (error.diagnostic.messageText as { messageText: string }).messageText :
          error.diagnostic.messageText as string;

        this.fileError(
          filename,
          line,
          character,
          'TS' + code,
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

    // Log the compiler version for custom verisons.
    if (this.taskConfig.typescript && this.taskConfig.typescript.version) {
      this.log(`Using custom version: ${this.taskConfig.typescript.version}`);
    }

    const tsCompilerOptions: ts.Params = assign({}, tsConfig.compilerOptions, {
      module: 'commonjs',
      sortOutput: true,
      typescript: this.taskConfig.typescript
    });

    /* tslint:disable:typedef */
    const { libFolder, libAMDFolder, libES6Folder } = this.buildConfig;
    /* tslint:enable:typedef */

    /* tslint:disable:no-any */
    const initializeCompilation: Function = (project: ts.Project, destPath: string): ts.Project => {
      let tsResult: any;
      /* tslint:enable:no-any */
      this.log('initializing ts compilation: ' + destPath);

      if (destPath) {
        tsResult = gulp.src(this.taskConfig.sourceMatch)
          .pipe(plumber({
            errorHandler: (): void => {
              errorCount++;
            }
          }))
          .pipe(sourcemaps.write({ sourceRoot: '/src' }))
          .pipe(ts(project, undefined, this.taskConfig.reporter));

        allStreams.push(
          tsResult.js
            .pipe(sourcemaps.write('.', { sourceRoot: '/src' }))
            .pipe(gulp.dest(destPath)));

        allStreams.push(tsResult.dts.pipe(gulp.dest(destPath)));
      }

      return project;
    };

    // Build commonjs.
    this._tsProject = initializeCompilation(
      ts.createProject(tsCompilerOptions),
      libFolder);

    // If AMD modules are required, also build that.
    initializeCompilation(
      ts.createProject(assign({}, tsCompilerOptions, { module: 'amd' })),
      libAMDFolder);

    // If ES6 modules are required, also build that.
    initializeCompilation(
      ts.createProject(assign({}, tsCompilerOptions, { module: 'es6', target: 'es6' })),
      libES6Folder);

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

  /** Override the new mergeConfig API */
  public mergeConfig(config: ITypeScriptTaskConfig): void {
    throw 'Do not use mergeConfig with gulp-core-build-typescript';
  }
}
