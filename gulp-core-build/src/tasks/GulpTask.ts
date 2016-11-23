/* tslint:disable:max-line-length */
import * as path from 'path';
import * as fs from 'fs';

import { GulpProxy } from '../GulpProxy';
import { IExecutable } from '../IExecutable';
import { IBuildConfig } from '../IBuildConfig';
import { log, verbose, error, fileError, fileWarning,
  warn, logEndSubtask, logStartSubtask } from '../logging';
import gutil = require('gulp-util');
import gulp = require('gulp');
import through2 = require('through2');

/* tslint:disable:typedef */
const eos = require('end-of-stream');
/* tslint:enable:typedef */

import { args } from '../State';
import { SchemaValidator } from '../jsonUtilities/SchemaValidator';

export abstract class GulpTask<TASK_CONFIG> implements IExecutable {
  public name: string;
  public buildConfig: IBuildConfig;
  public taskConfig: TASK_CONFIG;
  public cleanMatch: string[];

  private _schema: Object;

  /**
   * A JSON Schema object which will be used to validate this task's configuration file
   */
  public get schema(): Object {
    return this._schema ?
      this._schema :
      this._schema = this.loadSchema();
  }

  /**
   * Override this function to provide a schema which will be used to validate
   * the task's configuration file.
   */
  public loadSchema(): Object {
    return undefined;
  };

  /**
   * Shallow merges config settings into the task config.
   */
  public setConfig(taskConfig: TASK_CONFIG): void {
    /* tslint:disable:typedef */
    const objectAssign = require('object-assign');
    /* tslint:enable:typedef */

    this.taskConfig = objectAssign({}, this.taskConfig, taskConfig);
  }

  /**
   * Deep merges config settings into task config.
   */
  public mergeConfig(taskConfig: TASK_CONFIG): void {
    /* tslint:disable:typedef */
    const merge = require('lodash.merge');
    /* tslint:enable:typedef */

    this.taskConfig = merge({}, this.taskConfig, taskConfig);
  }

  /**
   * Replaces task config settings with new settings.
   */
  public replaceConfig(taskConfig: TASK_CONFIG): void {
    this.taskConfig = taskConfig;
  }

  public beforeExecute(): void {
    const configFilename: string = this._getConfigFilePath();
    const schema: Object = this.schema;

    let rawConfig: TASK_CONFIG = this._readConfigFile(configFilename, schema);

    if (rawConfig) {
      this.mergeConfig(rawConfig);
    }
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (!buildConfig || !buildConfig.isRedundantBuild);
  }

  public abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;

  public log(message: string): void {
    log(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public logVerbose(message: string): void {
    verbose(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public logWarning(message: string): void {
    warn(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public logError(message: string): void {
    error(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void {
    fileError(this.name, filePath, line, column, errorCode, message);
  }

  public fileWarning(filePath: string, line: number, column: number, errorCode: string, message: string): void {
    fileWarning(this.name, filePath, line, column, errorCode, message);
  }

  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: TASK_CONFIG = this.taskConfig): string[] {
    return this.cleanMatch;
  }

  public execute(config: IBuildConfig): Promise<void> {
    this.buildConfig = config;

    const startTime: [number, number] = process.hrtime();

    logStartSubtask(this.name);

    return new Promise((resolve, reject) => {
      /* tslint:disable:typedef */
      let stream;
      /* tslint:enable:typedef */

      try {
        if (!this.executeTask) {
          throw new Error('The task subclass is missing the "executeTask" method.');
        }

        stream = this.executeTask(this.buildConfig.gulp, (result?: Object) => {
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
          }, (err: Object) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });

          // Make sure the stream is completly read
          stream.pipe(through2.obj(
            (file: gutil.File,
              encoding: string,
              callback: (p?: Object) => void) => {
                'use strict';
                callback();
            },
            (callback: () => void) => {
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
    /* tslint:disable:typedef */
    const path = require('path');
    /* tslint:enable:typedef */
    if (path.isAbsolute(localPath)) {
      return path.resolve(localPath);
    }
    return path.resolve(path.join(this.buildConfig.rootPath, localPath));
  }

  public fileExists(localPath: string): boolean {
    /* tslint:disable:typedef */
    const fs = require('fs');
    /* tslint:enable:typedef */
    let doesExist: boolean = false;
    const fullPath: string = this.resolvePath(localPath);

    try {
      doesExist = fs.statSync(fullPath).isFile();
    } catch (e) { /* no-op */ }

    return doesExist;
  }

  public copyFile(localSourcePath: string, localDestPath?: string): void {
    /* tslint:disable:typedef */
    const path = require('path');
    const fs = require('fs-extra');
    /* tslint:enable:typedef */

    const fullSourcePath: string = path.resolve(__dirname, localSourcePath);
    const fullDestPath: string = path.resolve(
      this.buildConfig.rootPath,
      (localDestPath || path.basename(localSourcePath)));

    fs.copySync(fullSourcePath, fullDestPath);
  }

  public readJSONSync(localPath: string): Object {
    const fullPath: string = this.resolvePath(localPath);
    let result: Object = undefined;

    /* tslint:disable:typedef */
    const fs = require('fs');
    /* tslint:enable:typedef */

    try {
      let content: string = fs.readFileSync(fullPath, 'utf8');
      result = JSON.parse(content);
    } catch (e) { /* no-op */ }

    return result;
  }

  /**
   * Returns the path to the config file used to configure this task
   */
  protected _getConfigFilePath(): string {
    return path.join(process.cwd(), 'config', `${this.name}.json`);
  }

  /**
   * Loads a JSON file, supports reading JSON files with comments
   */
  protected _readCommentedJsonFile(filename: string): TASK_CONFIG {
    return SchemaValidator.readCommentedJsonFile(filename) as TASK_CONFIG;
  }

  /**
   * Helper function which loads a custom config file from disk, runs the SchemaValidator on it,
   * and then apply it to the callback defined on the IConfigurableTask
   */
  private _readConfigFile(filename: string, schema?: Object): TASK_CONFIG {
    if (!fs.existsSync(filename)) {
      return undefined;
    } else {
      if (args['verbose']) { // tslint:disable-line:no-string-literal
        console.log(`Found config file: ${path.basename(filename)}`);
      }

      const rawData: TASK_CONFIG =  this._readCommentedJsonFile(filename);

      if (schema) {
        SchemaValidator.validate(rawData, schema, filename);
      }

      return rawData;
    }
  }
}
