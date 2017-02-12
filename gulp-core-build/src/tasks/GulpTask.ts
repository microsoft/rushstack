/* tslint:disable:max-line-length */
import * as path from 'path';
import * as fs from 'fs';

import { GulpProxy } from '../GulpProxy';
import { IExecutable } from '../IExecutable';
import { IBuildConfiguration } from '../IBuildConfiguration';
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
export abstract class GulpTask<TASK_CONFIGURATION> implements IExecutable {
  /**
   * The name of the task. The configuration file with this name will be loaded and applied to the task.
   */
  public name: string;

  /**
   * The global build configuration object. Will be the same for all task instances.
   */
  public buildConfiguration: IBuildConfiguration;

  /**
   * The configuration for this task instance.
   */
  public taskConfiguration: TASK_CONFIGURATION;

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
   * Shallow merges configuration settings into the task configuration.
   * Note this will override configuration options for those which are objects.
   * @param taskConfiguration - configuration settings which should be applied
   */
  public setConfiguration(taskConfiguration: TASK_CONFIGURATION): void {
    /* tslint:disable:typedef */
    const objectAssign = require('object-assign');
    /* tslint:enable:typedef */

    this.taskConfiguration = objectAssign({}, this.taskConfiguration, taskConfiguration);
  }

  /**
   * Deep merges configuration settings into task configuration.
   * Do not use this function if the configuration contains complex objects that cannot be merged.
   * @param taskConfiguration - configuration settings which should be applied
   */
  public mergeConfiguration(taskConfiguration: TASK_CONFIGURATION): void {
    /* tslint:disable:typedef */
    const merge = require('lodash.merge');
    /* tslint:enable:typedef */

    this.taskConfiguration = merge({}, this.taskConfiguration, taskConfiguration);
  }

  /**
   * Replaces all of the task configuration settings with new settings.
   * @param taskConfiguration - the new task configuration
   */
  public replaceConfiguration(taskConfiguration: TASK_CONFIGURATION): void {
    this.taskConfiguration = taskConfiguration;
  }

  /**
   * This function is called when the task is initially registered into gulp-core-build as a task or subtask. It reads
   * the configuration file, validates it against the schema, then applies it to the task instance's configuration.
   */
  public onRegister(): void {
    const configurationFilename: string = this._getConfigurationFilePath();
    const schema: Object = this.schema;

    const rawConfiguration: TASK_CONFIGURATION = this._readConfigurationFile(configurationFilename, schema);

    if (rawConfiguration) {
      this.mergeConfiguration(rawConfiguration);
    }
  }

  /**
   * Overridable function which returns true if this task should be executed, or false if it should be skipped.
   * @param buildConfiguration - the build configuration which should be used when determining if the task is enabled
   * @returns true if the build is not redundant
   */
  public isEnabled(buildConfiguration: IBuildConfiguration): boolean {
    return (!buildConfiguration || !buildConfiguration.isRedundantBuild);
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
   * if buildConfiguration.shouldWarningsFailBuild is true, otherwise it will be logged to standard output.
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
   * @param buildConfiguration - the current build configuration
   * @param taskConfiguration - a task instance's configuration
   */
  public getCleanMatch(buildConfiguration: IBuildConfiguration,
                       taskConfiguration: TASK_CONFIGURATION = this.taskConfiguration): string[] {
    return this.cleanMatch;
  }

  /**
   * This function is called once to execute the task. It calls executeTask() and handles the return
   * value from that function. It also provides some utilities such as logging how long each
   * task takes to execute.
   * @param configuration - the buildConfiguration which is applied to the task instance before execution\
   * @returns a Promise which is completed when the task is finished executing
   */
  public execute(configuration: IBuildConfiguration): Promise<void> {
    this.buildConfiguration = configuration;

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

        stream = this.executeTask(this.buildConfiguration.gulp, (result?: Object) => {
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
   * Resolves a path relative to the buildConfiguration.rootPath.
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
    return path.resolve(path.join(this.buildConfiguration.rootPath, localPath));
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
      this.buildConfiguration.rootPath,
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
   * Returns the path to the configuration file used to configure this task
   */
  protected _getConfigurationFilePath(): string {
    return path.join(process.cwd(), 'config', `${this.name}.json`);
  }

  /**
   * Helper function which loads a custom configuration file from disk and validates it against the schema
   * @param filePath - the path to the custom configuration file
   * @param schema - the z-schema schema object used to validate the configuration file
   * @returns If the configuration file is valid, returns the configuration as an object.
   */
  private _readConfigurationFile(filePath: string, schema?: Object): TASK_CONFIGURATION {
    if (!fs.existsSync(filePath)) {
      return undefined;
    } else {
      if (args['verbose']) { // tslint:disable-line:no-string-literal
        console.log(`Found configuration file: ${path.basename(filePath)}`);
      }

      const rawData: TASK_CONFIGURATION = SchemaValidator.readCommentedJsonFile<TASK_CONFIGURATION>(filePath);

      if (schema) {
        SchemaValidator.validate(rawData, schema, filePath);
      }

      return rawData;
    }
  }
}
