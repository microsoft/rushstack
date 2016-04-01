/// <reference path='../typings/main.d.ts' />

/* tslint:disable:max-line-length */
import { IExecutable } from './IExecutable';
import { IBuildConfig } from './IBuildConfig';
import { log, error, fileError, warn, logEndSubtask, logStartSubtask } from './logging';
import gutil = require('gulp-util');
import gulp = require('gulp');
import through2 = require('through2');
const eos = require('end-of-stream');

export abstract class GulpTask<TASK_CONFIG> implements IExecutable {
  public name: string;
  public buildConfig: IBuildConfig;
  public taskConfig: TASK_CONFIG;
  public nukeMatch: string[];

  public setConfig(taskConfig: TASK_CONFIG) {
    let merge = require('lodash.merge');

    this.taskConfig = merge({}, this.taskConfig, taskConfig);
  }

  public replaceConfig(taskConfig: TASK_CONFIG) {
    this.taskConfig = taskConfig;
  }

  public isEnabled(): boolean {
    return true;
  }

  public abstract executeTask(gulp: gulp.Gulp, completeCallback?: (result?: any) => void): Promise<any> | NodeJS.ReadWriteStream | void;

  public log(message: string) {
    log(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public logWarning(message: string) {
    warn(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public logError(message: string) {
    error(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string) {
    fileError(this.name, filePath, line, column, errorCode, message);
  }

  public getNukeMatch(): string[] {
    return this.nukeMatch;
  }

  public execute(config: IBuildConfig): Promise<any> {
    this.buildConfig = config;

    let startTime = process.hrtime();

    logStartSubtask(this.name);

    return new Promise((resolve, reject) => {
      let stream;

      try {
        if (!this.executeTask) {
          throw new Error('The task subclass is missing the "executeTask" method.');
        }

        stream = this.executeTask(this.buildConfig.gulp, (result?: any) => {
          if (!result) {
            resolve();
          } else {
            reject(result);
          }
        });
      } catch (e) {
        this.logError(e);
        reject(e);
      }

      if (stream) {
        if (stream.then) {
          stream.then(resolve, reject);
        } else if (stream.pipe) {
          // wait for stream to end

          eos(stream, {
            error: true,
            readable: stream.readable,
            writable: stream.writable && !stream.readable
          }, (err: any) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });

          // Make sure the stream is completly read
          stream.pipe(through2.obj(
            function(
              file: gutil.File,
              encoding: string,
              callback: (p?: any) => void) {
              'use strict';
              callback();
            },
            function(callback: () => void) {
              'use strict';
              callback();
            }));

        } else if (this.executeTask.length === 1) {
          resolve(stream);
        }
      } else if (this.executeTask.length === 1) {
        resolve(stream);
      }
    })
      .then(() => {
        logEndSubtask(this.name, startTime);
      },
      (ex) => {
        logEndSubtask(this.name, startTime, ex);
        throw ex;
      });
  }

  public resolvePath(localPath: string): string {
    let path = require('path');
    if (path.isAbsolute(localPath)) {
      return path.resolve(localPath);
    }
    return path.resolve(path.join(this.buildConfig.rootPath, localPath));
  }

  public fileExists(localPath: string): boolean {
    let fs = require('fs');
    let doesExist = false;
    let fullPath = this.resolvePath(localPath);

    try {
      let stats = fs.statSync(fullPath);
      doesExist = stats.isFile();
    } catch (e) { /* no-op */ }

    return doesExist;
  }

  public copyFile(localSourcePath: string, localDestPath?: string) {
    let path = require('path');
    let fs = require('fs-extra');

    let fullSourcePath = path.resolve(__dirname, localSourcePath);
    let fullDestPath = path.resolve(
      this.buildConfig.rootPath,
      (localDestPath || path.basename(localSourcePath)));

    fs.copySync(fullSourcePath, fullDestPath);
  }

  public readJSONSync(localPath: string): string {
    let fullPath = this.resolvePath(localPath);
    let result = null;
    let fs = require('fs');

    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      result = JSON.parse(content);
    } catch (e) { /* no-op */ }

    return result;
  }
}
