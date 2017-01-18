import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');
import ts = require('gulp-typescript');
import * as path from 'path';

import { IBuildConfig } from '@microsoft/gulp-core-build';
import { TypeScriptConfiguration } from './TypeScriptConfiguration';

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

/** Includes the experimental stripInternal feature */
export interface ICompilerOptions extends ts.Settings {
  stripInternal?: boolean;
}

export interface ITypeScriptTaskConfig {
  /**
   * Fails the build when errors occur.
   * @default true
   */
  failBuildOnErrors?: boolean;

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
  reporter?: ts.reporter.Reporter;

  /**
   * Removes comments from all generated `.js` files. Will **not** remove comments from generated `.d.ts` files.
   * Defaults to false.
   */
  removeCommentsFromJavaScript?: boolean;

  /**
   * If true, creates sourcemap files which are useful for debugging. Defaults to true.
   */
  emitSourceMaps?: boolean;

  /**
   * The directory to write the compiled javascript and typings files to. Defaults to buildConfig.libFolder
   */
  libDir?: string;

  /**
   * If defined, drop typescript files from an AMD build here. Defaults to buildConfig.libAMDFolder
   */
  libAMDDir?: string;
}

export class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  public name: string = 'typescript';

  public taskConfig: ITypeScriptTaskConfig = {
    failBuildOnErrors: true,
    reporter: {
      error: (error: ts.reporter.TypeScriptError): void => {
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
    ],
    removeCommentsFromJavaScript: false,
    emitSourceMaps: true,
    libDir: undefined,
    libAMDDir: undefined
  };

  private _tsProject: ts.Project;
  private _tsAMDProject: ts.Project;

  public executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void {
    /* tslint:disable:typedef */
    const assign = require('object-assign');
    const merge = require('merge2');
    /* tslint:enable:typedef */

    const allStreams: NodeJS.ReadWriteStream[] = [];

    const result: { errorCount: number } = {
      errorCount: 0
    };

    this._normalizeConfig();

    // Log the compiler version for custom verisons.
    const typescript: any = TypeScriptConfiguration.getTypescriptCompiler(); // tslint:disable-line:no-any
    if (typescript && typescript.version) {
      this.log(`TypeScript version: ${typescript.version}`);
    }

    // tslint:disable-next-line:no-any
    let compilerOptions: ICompilerOptions =
      TypeScriptConfiguration.getGulpTypescriptOptions(this.buildConfig).compilerOptions;

    if (compilerOptions.module !== 'commonjs') {
      this.logWarning(`Your tsconfig.json file specifies a different "target" than expected. `
        + `Expected: "commonjs". Actual: "${compilerOptions.module}". Using "commonjs" instead.`);
      compilerOptions.module = 'commonjs';
    }

    this._tsProject = this._tsProject || ts.createProject(compilerOptions);

    this._compileProject(gulp, this._tsProject, this.taskConfig.libDir, allStreams, result);

    // Static passthrough files.
    const staticSrc: NodeJS.ReadWriteStream = gulp.src(this.taskConfig.staticMatch);

    allStreams.push(
      staticSrc.pipe(gulp.dest(this.taskConfig.libDir)));

    // If AMD modules are required, also build that.
    if (this.taskConfig.libAMDDir) {
      allStreams.push(
        staticSrc.pipe(gulp.dest(this.taskConfig.libAMDDir)));

      this._tsAMDProject = this._tsAMDProject || ts.createProject(assign({}, compilerOptions, { module: 'amd' }));
      this._compileProject(gulp, this._tsAMDProject, this.taskConfig.libAMDDir, allStreams, result);
    }

    // Listen for pass/fail, and ensure that the task passes/fails appropriately.
    merge(allStreams)
      .on('queueDrain', () => {
        if (this.taskConfig.failBuildOnErrors && result.errorCount) {
          completeCallback('TypeScript error(s) occurred.');
        } else {
          completeCallback();
        }
      })
      .on('error', completeCallback);
  }

  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: ITypeScriptTaskConfig = this.taskConfig): string[] {
    this._normalizeConfig(buildConfig);
    const cleanMatch: string[] = [
      this.taskConfig.libDir
    ];
    if (this.taskConfig.libAMDDir) {
      cleanMatch.push(this.taskConfig.libAMDDir);
    }
    return cleanMatch;
  }

  /** Override the new mergeConfig API */
  public mergeConfig(config: ITypeScriptTaskConfig): void {
    throw 'Do not use mergeConfig with gulp-core-build-typescript';
  }

  private _normalizeConfig(buildConfig: IBuildConfig = this.buildConfig): void {
    if (!this.taskConfig.libDir) {
      this.taskConfig.libDir = buildConfig.libFolder;
    }

    if (!this.taskConfig.libAMDDir) {
      this.taskConfig.libAMDDir = buildConfig.libAMDFolder;
    }
  }

  private _compileProject(gulp: gulpType.Gulp, tsProject: ts.Project, destDir: string,
    allStreams: NodeJS.ReadWriteStream[], result: { errorCount: number }): void {
    /* tslint:disable:typedef */
    const plumber = require('gulp-plumber');
    const sourcemaps = require('gulp-sourcemaps');
    /* tslint:enable:typedef */

    // tslint:disable-next-line:no-any
    let tsResult: any = gulp.src(this.taskConfig.sourceMatch)
      .pipe(plumber({
        errorHandler: (): void => {
          result.errorCount++;
        }
      }));

    if (this.taskConfig.emitSourceMaps) {
      tsResult = tsResult.pipe(sourcemaps.init());
    }

    tsResult = tsResult
      .pipe(tsProject(this.taskConfig.reporter));

    // tslint:disable-next-line:typedef
    let jsResult = (this.taskConfig.removeCommentsFromJavaScript
      ? tsResult.js.pipe(require('gulp-decomment')({
        space: !!this.taskConfig.emitSourceMaps /* turn comments into spaces to preserve sourcemaps */
      }))
      : tsResult.js);

    if (this.taskConfig.emitSourceMaps) {
      jsResult = jsResult.pipe(sourcemaps.write('.', { sourceRoot: this._resolveSourceMapRoot }));
    }

    allStreams.push(jsResult
      .pipe(gulp.dest(destDir)));

    allStreams.push(tsResult.dts.pipe(gulp.dest(destDir)));
  }

  private _resolveSourceMapRoot(file: { relative: string, cwd: string }): string {
    return path.relative(file.relative, path.join(file.cwd, 'src'));
  }
}
