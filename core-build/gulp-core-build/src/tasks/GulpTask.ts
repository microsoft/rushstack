// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@microsoft/node-core-library';

import { GulpProxy } from '../GulpProxy';
import { IExecutable } from '../IExecutable';
import { IBuildConfig } from '../IBuildConfig';
import {
  log,
  verbose,
  error,
  fileError,
  fileWarning,
  warn,
  logEndSubtask,
  logStartSubtask
} from '../logging';
import Vinyl = require('vinyl');
import gulp = require('gulp');
import through2 = require('through2');

/* tslint:disable:typedef */
const eos = require('end-of-stream');
/* tslint:enable:typedef */

import { args } from '../State';

/**
 * The base GulpTask class, should be extended by any classes which represent build tasks.
 * It provides convenient mechanisms for reading configuration files, validating their schema,
 * etc. It also provides convenient utility and logging functions.
 * @public
 */
export abstract class GulpTask<TTaskConfig> implements IExecutable {
  /**
   * The name of the task. The configuration file with this name will be loaded and applied to the task.
   */
  public name: string;

  /**
   * The global build configuration object. Will be the same for all task instances.
   */
  public buildConfig: IBuildConfig;

  /**
   * The configuration for this task instance.
   */
  public taskConfig: TTaskConfig;

  /**
   * An overridable array of file patterns which will be utilized by the CleanTask to
   * determine which files to delete. Unless overridden, the getCleanMatch() function
   * will return this value.
   */
  public cleanMatch: string[];

  /**
   * Indicates whether this task should be executed or not. This toggle is used by isEnabled() to determine
   * if the task should run. Since some tasks have more complex logic to determine if they should run or
   * not, the isEnabled() function can be overridden.
   */
  public enabled: boolean = true;

  /**
   * The memoized schema for this task. Should not be utilized by child classes, use schema property instead.
   */
  private _schema: Object | undefined;

  /**
   * Initializes a new instance of the task with the specified initial task config
   */
  public constructor(name: string, initialTaskConfig: Partial<TTaskConfig> = {}) {
    this.name = name;
    this.setConfig(initialTaskConfig);
  }

  /**
   * Overridable function which returns true if this task should be executed, or false if it should be skipped.
   * @param buildConfig - the build configuration which should be used when determining if the task is enabled
   * @returns true if the build is not redundant and the enabled toggle is true
   */
  public isEnabled(buildConfig: IBuildConfig): boolean {
    return (!buildConfig || !buildConfig.isRedundantBuild) && this.enabled;
  }

  /**
   * A JSON Schema object which will be used to validate this task's configuration file.
   * @returns a z-schema schema definition
   */
  public get schema(): Object | undefined {
    return this._schema ? this._schema : (this._schema = this.loadSchema());
  }

  /**
   * Shallow merges config settings into the task config.
   * Note this will override configuration options for those which are objects.
   * @param taskConfig - configuration settings which should be applied
   */
  public setConfig(taskConfig: Partial<TTaskConfig>): void {
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
  public mergeConfig(taskConfig: Partial<TTaskConfig>): void {
    /* tslint:disable:typedef */
    const merge = require('lodash.merge');
    /* tslint:enable:typedef */

    this.taskConfig = merge({}, this.taskConfig, taskConfig);
  }

  /**
   * Replaces all of the task config settings with new settings.
   * @param taskConfig - the new task configuration
   */
  public replaceConfig(taskConfig: TTaskConfig): void {
    this.taskConfig = taskConfig;
  }

  /**
   * This function is called when the task is initially registered into gulp-core-build as a task or subtask. It reads
   * the configuration file, validates it against the schema, then applies it to the task instance's configuration.
   */
  public onRegister(): void {
    const configFilename: string = this._getConfigFilePath();
    const schema: Object | undefined = this.schema;

    const rawConfig: TTaskConfig | undefined = this._readConfigFile(configFilename, schema);

    if (rawConfig) {
      this.mergeConfig(rawConfig);
    }
  }

  /**
   * When the task is executed by the build system, this function is called once. Note that this function
   * must either return a Promise, a Stream, or call the completeCallback() parameter.
   * @param gulp - an instance of the gulp library
   * @param completeCallback - a callback which should be called if the function is non-value returning
   * @returns a Promise, a Stream or undefined if completeCallback() is called
   */
  public abstract executeTask(
    gulp: gulp.Gulp | GulpProxy,
    completeCallback?: (error?: string | Error) => void
  ): Promise<Object | void> | NodeJS.ReadWriteStream | void;

  /**
   * Logs a message to standard output.
   * @param message - the message to log to standard output.
   */
  public log(message: string): void {
    log(`[${colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs a message to standard output if the verbose flag is specified.
   * @param message - the message to log when in verbose mode
   */
  public logVerbose(message: string): void {
    verbose(`[${colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs a warning. It will be logged to standard error and cause the build to fail
   * if buildConfig.shouldWarningsFailBuild is true, otherwise it will be logged to standard output.
   * @param message - the warning description
   */
  public logWarning(message: string): void {
    warn(`[${colors.cyan(this.name)}] ${message}`);
  }

  /**
   * Logs an error to standard error and causes the build to fail.
   * @param message - the error description
   */
  public logError(message: string): void {
    error(`[${colors.cyan(this.name)}] ${message}`);
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
  public fileWarning(
    filePath: string,
    line: number,
    column: number,
    warningCode: string,
    message: string
  ): void {
    fileWarning(this.name, filePath, line, column, warningCode, message);
  }

  /**
   * An overridable function which returns a list of glob patterns representing files that should be deleted
   * by the CleanTask.
   * @param buildConfig - the current build configuration
   * @param taskConfig - a task instance's configuration
   */
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: TTaskConfig = this.taskConfig): string[] {
    return this.cleanMatch;
  }

  /**
   * This function is called once to execute the task. It calls executeTask() and handles the return
   * value from that function. It also provides some utilities such as logging how long each
   * task takes to execute.
   * @param config - the buildConfig which is applied to the task instance before execution
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

        stream = this.executeTask(this.buildConfig.gulp, (err?: string | Error) => {
          if (!err) {
            resolve();
          } else if (typeof err === 'string') {
            reject(new Error(err));
          } else {
            reject(err);
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

          eos(
            stream,
            {
              error: true,
              readable: stream.readable,
              writable: stream.writable && !stream.readable
            },
            (err: Object) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }
          );

          // Make sure the stream is completely read
          stream.pipe(
            through2.obj(
              (file: Vinyl, encoding: string, callback: (p?: Object) => void) => {
                callback();
              },
              (callback: () => void) => {
                callback();
              }
            )
          );
        } else if (this.executeTask.length === 1) {
          resolve(stream);
        }
      } else if (this.executeTask.length === 1) {
        resolve(stream);
      }
    }).then(
      () => {
        logEndSubtask(this.name, startTime);
      },
      ex => {
        logEndSubtask(this.name, startTime, ex);
        throw ex;
      }
    );
  }

  /**
   * Resolves a path relative to the buildConfig.rootPath.
   * @param localPath - a relative or absolute path
   * @returns If localPath is relative, returns an absolute path relative to the rootPath. Otherwise, returns localPath.
   */
  public resolvePath(localPath: string): string {
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
    let doesExist: boolean = false;
    const fullPath: string = this.resolvePath(localPath);

    try {
      doesExist = FileSystem.getStatistics(fullPath).isFile();
    } catch (e) {
      /* no-op */
    }

    return doesExist;
  }

  /**
   * Copy a file from one location to another.
   * @param localSourcePath - path to the source file
   * @param localDestPath - path to the destination file
   */
  public copyFile(localSourcePath: string, localDestPath?: string): void {
    const fullSourcePath: string = path.resolve(__dirname, localSourcePath);
    const fullDestPath: string = path.resolve(
      this.buildConfig.rootPath,
      localDestPath || path.basename(localSourcePath)
    );

    FileSystem.copyFile({
      sourcePath: fullSourcePath,
      destinationPath: fullDestPath
    });
  }

  /**
   * Read a JSON file into an object
   * @param localPath - the path to the JSON file
   */
  public readJSONSync(localPath: string): Object | undefined {
    const fullPath: string = this.resolvePath(localPath);
    let result: Object | undefined = undefined;

    try {
      const content: string = FileSystem.readFile(fullPath);
      result = JSON.parse(content);
    } catch (e) {
      /* no-op */
    }

    return result;
  }

  /**
   * Override this function to provide a schema which will be used to validate
   * the task's configuration file. This function is called once per task instance.
   * @returns a z-schema schema definition
   */
  protected loadSchema(): Object | undefined {
    return undefined;
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
  private _readConfigFile(filePath: string, schema?: Object): TTaskConfig | undefined {
    if (!FileSystem.exists(filePath)) {
      return undefined;
    } else {
      if (args['verbose']) {
        // tslint:disable-line:no-string-literal
        console.log(`Found config file: ${path.basename(filePath)}`);
      }

      const rawData: TTaskConfig = JsonFile.load(filePath);

      if (schema) {
        // TODO: Convert GulpTask.schema to be a JsonSchema instead of a bare object
        const jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schema);
        jsonSchema.validateObject(rawData, filePath);
      }

      return rawData;
    }
  }
}
