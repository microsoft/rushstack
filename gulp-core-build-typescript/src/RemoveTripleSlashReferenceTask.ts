import gulp = require('gulp');
import gulpUtil = require('gulp-util');
import * as path from 'path';
import through2 = require('through2');
/* tslint:disable:typedef */
const cached = require('gulp-cache');
const md5 = require('md5');
/* tslint:enable:typedef */

import { GulpTask } from '@microsoft/gulp-core-build';

export interface IRemoveTripleSlashReferenceTaskConfig {
}

export class RemoveTripleSlashReferenceTask extends GulpTask<IRemoveTripleSlashReferenceTaskConfig> {
  public name: string = 'ts-npm-lint';

  public taskConfig: IRemoveTripleSlashReferenceTaskConfig = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    const taskScope: RemoveTripleSlashReferenceTask = this;

    const filePattern: string = path.join(taskScope.buildConfig.libFolder, '**', '*.d.ts');

    /**
     * Matches:
     *  /// <reference path="../../typings.d.ts" />
     *  /// <reference path='../../typings.d.ts' />
     *  ///<reference path='../../typings.d.ts' />
     *  ///<reference foo="bar" path='../../typings.d.ts'/>
     *  /// <reference path='../../typings.d.ts' bar="foo" />
     */
    const referencePathRegex: RegExp = /^\/\/\/[ ]+<reference.*path=['"]([^'"]*)['"][^>]+>/gm;
    return gulp.src(filePattern)
      .pipe(cached(
        /* tslint:disable:no-function-expression */
        through2.obj(function(file: gulpUtil.File, encoding: string,
          callback: (encoding?: string, file?: gulpUtil.File) => void): void {
          /* tslint:enable:no-function-expression */

          try {
            const rawContents: string = file.contents.toString();
            const relativePathToCurrentFile: string = path.relative(taskScope.buildConfig.rootPath, file.path);
            taskScope.logVerbose(relativePathToCurrentFile);

            file[taskScope.name] = {
              failureCount: 0
            };

            const newContents: string = rawContents.replace(referencePathRegex,
              (_: string, tsdFile: string) => {
                file[taskScope.name].failureCount++;
                taskScope.log(`Removed reference to '${tsdFile}' in ${relativePathToCurrentFile}`);
                return `// [${taskScope.name}] removed reference to '${tsdFile}'`;
              }
            );

            file.contents = new Buffer(newContents);
            this.push(file);
            callback();
          } catch (e) {
            taskScope.logError(e);
            callback(e);
          }
        }),
        {
          name: md5(taskScope.name + taskScope.buildConfig.rootPath),
          // What on the result indicates it was successful
          success: (jshintedFile: gulpUtil.File): boolean => {
            /* tslint:disable:no-string-literal */
            return jshintedFile[taskScope.name].failureCount === 0;
            /* tslint:enable:no-string-literal */
          },
          // By default, the cache attempts to store the value of the objects in the stream
          // For this task, this is over-engineering since we never need to store anything extra.
          value: (file: gulpUtil.File): Object => {
            return {
              path: file.path
            };
          }
        }
      ))
      .pipe(gulp.dest(taskScope.buildConfig.libFolder));
  }
}
