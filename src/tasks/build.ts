/// <reference path="../../typings/tsd" />

import { IBuildOptions } from '../options/build';

export default class BuildTasks { // implements ITaskGroup {

  public static registerTasks(build: any, options: IBuildOptions) {
    let dependencies = [];
    let path = require('path');
    let ts = require('gulp-typescript');
    let fs = require('fs');
    let gulp = build.gulp;
    let paths = options.paths;
    let tsConfig;
    let tsConfigPath = path.resolve(build.rootDir, 'tsconfig.json');
    let plumber = require('gulp-plumber');
    let useLint = options.isLintingEnabled;
    let chalk = require('chalk');

    if (fs.existsSync(tsConfigPath)) {
      tsConfig = require(tsConfigPath);
    } else {
      tsConfig = require('../../tsconfig.json');
    }
    let tsProject = ts.createProject(tsConfig.compilerOptions);

    if (paths.sourceMatch && useLint) {
      dependencies.push('build-lint');

      build.task('build-lint', () => {
        let lint = require('gulp-tslint');
        let lintConfig = options.lintConfig;

        return gulp.src(paths.sourceMatch)
          .pipe(plumber())
          .pipe(lint({
            configuration: lintConfig
          }))
          .pipe(lint.report('prose', {
            emitError: false
          }));
      });
    }

    if (paths.sourceMatch) {
      dependencies.push('build-ts');
      build.task('build-ts', () => {
        let merge = require('merge2');
        let errorCount = 0;
        let tsResult = gulp.src(paths.sourceMatch)
          .pipe(plumber({
            errorHandler: (error) => {
              errorCount++;
              build.logError(error);
            }
          }))
          .pipe(ts(tsProject, undefined, ts.reporter.nullReporter()));

        let mergedStream = merge([
          tsResult.js.pipe(gulp.dest(paths.libFolder)),
          tsResult.dts.pipe(gulp.dest(paths.libFolder))
        ]);

        mergedStream.on('queueDrain', () => {
          if (errorCount) {
            build.logError(`*** Total TypeScript error(s): ${ chalk.red(errorCount) }`);
          }
        });

        return mergedStream;
      });
    }

    if (paths.lessMatch) {
      dependencies.push('build-less');
      build.task('build-less', () => {
        let minifyCss = require('gulp-minify-css');
        let less = require('gulp-less');
        let textToJs = require('gulp-texttojs');

        return gulp.src(paths.lessMatch)
          .pipe(plumber({
            errorHandler: (error) => build.logError(error)
          }))
          .pipe(less())
          .pipe(minifyCss())
          .pipe(textToJs({
            template: 'require(\'load-styles\')(<%= content %>);'
          }))
          .pipe(gulp.dest(paths.libFolder));
      });
    }

    if (paths.htmlMatch) {
      dependencies.push('build-html');
      build.task('build-html', () => {
        let minifyHtml = require('gulp-minify-html');

        return gulp.src(paths.htmlMatch)
          .pipe(plumber({
            errorHandler: (error) => build.logError(error)
          }))
          .pipe(minifyHtml())
          .pipe(gulp.dest(paths.libFolder));
      });
    }

    if (paths.staticsMatch) {
      dependencies.push('build-statics');
      build.task('build-statics', () => {
        let merge = require('merge2');
        let tasks = [];
        let flatten = require('gulp-flatten');

        tasks.push(
          gulp.src(paths.staticsMatch)
            .pipe(gulp.dest(paths.libFolder)));

        for (var copyDest in options.copyTo) {
          if (options.copyTo.hasOwnProperty(copyDest)) {
            let sources = options.copyTo[copyDest];

            sources.forEach(sourceMatch => tasks.push(
              gulp.src(sourceMatch)
                .pipe(flatten())
                .pipe(gulp.dest(copyDest))
            ));
          }
        }

        return merge(tasks);
      });
    }

    build.task('build', dependencies);

    build.task('build-watch', ['build'], () => {
      if (paths.sourceMatch) {
        gulp.watch(paths.sourceMatch, ['build-ts']);
      }

      if (paths.lessMatch) {
        gulp.watch(paths.lessMatch, ['build-less']);
      }

      if (paths.htmlMatch) {
        gulp.watch(paths.htmlMatch, ['build-html']);
      }

      if (paths.staticsMatch) {
        gulp.watch(paths.staticsMatch, ['build-statics']);
      }
    });

  }
}
