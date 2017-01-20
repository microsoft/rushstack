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

/**
 * The base GulpTask class, should be extended by any classes which represent build tasks.
 * It provides convenient mechanisms for reading configuration files, validating their schema,
 * etc. It also provides convenient utility and logging functions.
 */
export abstract class GulpTask<TASK_CONFIG> implements IExecutable {
  /** The name of the task. The configuration file with this name will be loaded and applied to the task. */
  public name: string;
  /** The global build configuration object. Will be the same for all task instances. */
  public buildConfig: IBuildConfig;
  /** The configuration for this task instance. */
  public taskConfig: TASK_CONFIG;
  /**
   * An overridable array of file patterns which will be utilized by the CleanTask to
   * determine which files to delete. Unless overridden, the getCleanMatch() function
   * will return this value.
   */
  public cleanMatch: string[];

  /**
   * The memoized schema for this task. Should not be utilized by child classes, use schema property instead.
   */
  private _schema: Object;

  /**
   * A JSON Schema object which will be used to validate this task's configuration file.
   * @returns a z-schema schema definition
   */
  public get schema(): Object {
    return this._schema ?
      this._schema :
      this._schema = this.loadSchema();
  }

  /**
   * Override this function to provide a schema which will be used to validate
   * the task's configuration file. This function is called once per task instance.
   * @returns a z-schema schema definition
   */
  protected loadSchema(): Object {
    return undefined;
  };

  /**
   * Shallow merges config settings into the task config.
   * Note this will override configuration options for those which are objects.
   * @param taskConfig - configuration settings which should be applied
   */
  public setConfig(taskConfig: TASK_CONFIG): void {
    /* tslint:disable:typedef */
    const objectAssign = require('object-assign');
    /* tslint:enable:typedef */

    this.taskConfig = objectAssign({}, this.taskConfig, taskConfig);
  }

  /**
   * Deep merges config settings into task config.
   * Do not use this function if the configuration contains complex objects that cannot be merged.
   * @param taskConfig - configuration settings which should be applied
   */
  public mergeConfig(taskConfig: TASK_CONFIG): void {
    /* tslint:disable:typedef */
    const merge = require('lodash.merge');
    /* tslint:enable:typedef */

    this.taskConfig = merge({}, this.taskConfig, taskConfig);
  }

  /**
   * Replaces all of the task config settings with new settings.
   * @param taskConfig - the new task configuration
   */
  public replaceConfig(taskConfig: TASK_CONFIG): void {
    this.taskConfig = taskConfig;
  }

  /**
   * This function is called when the task is initially registered into gulp-core-build as a task or subtask. It reads
   * the configuration file, validates it against the schema, then applies it to the task instance's configuration.
   */
  public onRegister(): void {
    const configFilename: string = this._getConfigFilePath();
    const schema: Object = this.schema;

    const rawConfig: TASK_CONFIG = this._readConfigFile(configFilename, schema);

    if (rawConfig) {
      this.mergeConfig(rawConfig);
    }
  }

  /**
   * Overridable function which returns true if this task should be executed, or false if it should be skipped.
   * @param buildConfig - the build configuration which should be used when determining if the task is enabled
   * @returns true if the build is not redundant
   */
  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (!buildConfig || !buildConfig.isRedundantBuild);
  }

  /**
   * When the task is executed by the build system, this function is called once. Note that this function
   * must either return a Promise, a Stream, or call the completeCallback() parameter.
   * @param gulp - an instance of the gulp library
   * @param completeCallback - a callback which should be called if the function is non-value returning
   * @returns a Promise, a Stream or undefined if completeCallback() is called
   */
  public abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;

  /**
   * Logs a message to standard output.
   * @param message - the message to log to standard output.
   */
  public log(message: string): void {
    log(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs a message to standard output if the verbose flag is specified.
   * @param message - the message to log when in verbose mode
   */
  public logVerbose(message: string): void {
    verbose(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs a warning. It will be logged to standard error and cause the build to fail
   * if buildConfig.shouldWarningsFailBuild is true, otherwise it will be logged to standard output.
   * @param message - the warning description
   */
  public logWarning(message: string): void {
    warn(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs an error to standard error and causes the build to fail.
   * @param message - the error description
   */
  public logError(message: string): void {
    error(`[${gutil.colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs an error regarding a specific file to standard error and causes the build to fail.
   * @param filePath - the path to the file which encountered an issue
   * @param line - the line in the file which had an issue
   * @param column - the column in the file which had an issue
   * @param errorCode - the custom error code representing this error
   * @param message - a description of the error
   */
  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void {
    fileError(this.name, filePath, line, column, errorCode, message);
  }

  /**
   * Logs a warning regarding a specific file.
   * @param filePath - the path to the file which encountered an issue
   * @param line - the line in the file which had an issue
   * @param column - the column in the file which had an issue
   * @param warningCode - the custom warning code representing this warning
   * @param message - a description of the warning
   */
  public fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void {
    fileWarning(this.name, filePath, line, column, warningCode, message);
  }

  /**
   * An overridable function which returns a list of glob patterns representing files that should be deleted
   * by the CleanTask.
   * @param buildConfig - the current build configuration
   * @param taskConfig - a task instance's configuration
   */
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: TASK_CONFIG = this.taskConfig): string[] {
    return this.cleanMatch;
  }

  /**
   * This function is once to execute the task. It calls executeTask() and handles the return
   * value from that function. It also provides some utilities such as logging how long each
   * task takes to execute.
   * @param config - the buildConfig which is applied to the task instance before execution\
   * @returns a Promise which is completed when the task is finished executing
   */
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

  /**
   * Resolves a path relative to the buildConfig.rootPath.
   * @param localPath - a relative or absolute path
   * @returns If localPath is relative, returns an absolute path relative to the rootPath. Otherwise, returns localPath.
   */
  public resolvePath(localPath: string): string {
    /* tslint:disable:typedef */
    const path = require('path');
    /* tslint:enable:typedef */
    if (path.isAbsolute(localPath)) {
      return path.resolve(localPath);
    }
    return path.resolve(path.join(this.buildConfig.rootPath, localPath));
  }

  /**
   * Synchronously detect if a file exists.
   * @param localPath - the path to the file [resolved using resolvePath()]
   * @returns true if the file exists, false otherwise
   */
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

  /**
   * Copy a file from one location to another.
   * @param localSourcePath - path to the source file
   * @param localDestPath - path to the destination file
   */
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

  /**
   * Read a JSON file into an object
   * @param localPath - the path to the JSON file
   */
  public readJSONSync(localPath: string): Object {
    const fullPath: string = this.resolvePath(localPath);
    let result: Object = undefined;

    /* tslint:disable:typedef */
    const fs = require('fs');
    /* tslint:enable:typedef */

    try {
      const content: string = fs.readFileSync(fullPath, 'utf8');
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
   * Helper function which loads a custom configuration file from disk and validates it against the schema
   * @param filePath - the path to the custom configuration file
   * @param schema - the z-schema schema object used to validate the configuration file
   * @returns If the configuration file is valid, returns the configuration as an object.
   */
  private _readConfigFile(filePath: string, schema?: Object): TASK_CONFIG {
    if (!fs.existsSync(filePath)) {
      return undefined;
    } else {
      if (args['verbose']) { // tslint:disable-line:no-string-literal
        console.log(`Found config file: ${path.basename(filePath)}`);
      }

      const rawData: TASK_CONFIG = SchemaValidator.readCommentedJsonFile<TASK_CONFIG>(filePath);

      if (schema) {
        SchemaValidator.validate(rawData, schema, filePath);
      }

      return rawData;
    }
  }
}
