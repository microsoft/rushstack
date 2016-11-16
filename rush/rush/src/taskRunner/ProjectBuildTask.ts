/**
 * @file ProjectBuildTask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A TaskRunner task which cleans and builds a project
 */

import * as child_process from 'child_process';
import * as fsx from 'fs-extra';

import * as os from 'os';
import * as path from 'path';
import { ITaskWriter } from '@microsoft/stream-collator';
import {
  RushConfig,
  RushConfigProject,
  ErrorDetector,
  ErrorDetectionMode,
  TaskError,
  Utilities
} from '@microsoft/rush-lib';
import TaskStatus from './TaskStatus';
import {
  getPackageDeps,
  IPackageDeps
} from '@microsoft/package-deps-hash';
import { ITaskDefinition } from '../taskRunner/ITask';

const PACKAGE_DEPS_FILENAME: string = 'package-deps.json';

export default class ProjectBuildTask implements ITaskDefinition {
  public name: string;
  public isIncrementalBuildAllowed: boolean;

  private _errorDetector: ErrorDetector;
  private _errorDisplayMode: ErrorDetectionMode;
  private _rushProject: RushConfigProject;
  private _rushConfig: RushConfig;
  private _production: boolean;
  private _npmMode: boolean;

  constructor(
    rushProject: RushConfigProject,
    rushConfig: RushConfig,
    errorDetector: ErrorDetector,
    errorDisplayMode: ErrorDetectionMode,
    production: boolean,
    npmMode: boolean,
    isIncrementalBuildAllowed: boolean
  ) {
    this.name = rushProject.packageName;
    this._errorDetector = errorDetector;
    this._errorDisplayMode = errorDisplayMode;
    this._production = production;
    this._npmMode = npmMode;
    this._rushProject = rushProject;
    this._rushConfig = rushConfig;
    this.isIncrementalBuildAllowed = isIncrementalBuildAllowed;
  }

  public execute(writer: ITaskWriter): Promise<TaskStatus> {
    return new Promise<TaskStatus>((resolve: (status: TaskStatus) => void, reject: (errors: TaskError[]) => void) => {
      getPackageDeps(this._rushProject.projectFolder, [PACKAGE_DEPS_FILENAME]).then(
        (deps: IPackageDeps) => { this._executeTask(writer, deps, resolve, reject); },
        (error: Error) => { this._executeTask(writer, undefined, resolve, reject); }
      );
    });
  }

  private _executeTask(
    writer: ITaskWriter,
    currentPackageDeps: IPackageDeps,
    resolve: (status: TaskStatus) => void,
    reject: (errors: TaskError[]) => void
  ): void {

    const projectFolder: string = this._rushProject.projectFolder;
    const currentDepsPath: string = path.join(this._rushProject.projectFolder, PACKAGE_DEPS_FILENAME);
    let lastPackageDeps: IPackageDeps;

    try {
      writer.writeLine(`>>> ${this.name}`);

      if (fsx.existsSync(currentDepsPath)) {
        lastPackageDeps = JSON.parse(fsx.readFileSync(currentDepsPath, 'utf8')) as IPackageDeps;
      }

      const isPackageUnchanged: boolean = (
        !!(
          lastPackageDeps &&
          currentPackageDeps &&
          _areShallowEqual(currentPackageDeps.files, lastPackageDeps.files, writer)
        )
      );

      if (isPackageUnchanged && this.isIncrementalBuildAllowed) {
        resolve(TaskStatus.Skipped);
      } else {
        // If the deps file exists, remove it before starting a build.
        if (fsx.existsSync(currentDepsPath)) {
          fsx.unlinkSync(currentDepsPath);
        }

        writer.writeLine('npm run clean');
        Utilities.executeCommand(this._rushConfig.npmToolFilename, ['run', 'clean'],
          projectFolder, true);

        const args: string[] = [
          'run',
          'test',
          '--', // Everything after this will be passed directly to the gulp task
          '--color'
        ];
        if (this._production) {
          args.push('--production');
        }
        if (this._npmMode) {
          args.push('--npm');
        }
        writer.writeLine('npm ' + args.join(' '));

        const buildTask: child_process.ChildProcess = Utilities.executeCommandAsync(
          this._rushConfig.npmToolFilename, args, projectFolder);

        buildTask.stdout.on('data', (data: string) => {
          writer.write(data);
        });

        buildTask.stderr.on('data', (data: string) => {
          writer.writeError(data);
        });

        buildTask.on('close', (code: number) => {
          // Detect & display errors
          const errors: TaskError[] = this._errorDetector.execute(
            writer.getStdOutput() + os.EOL + writer.getStdError());

          for (let i: number = 0; i < errors.length; i++) {
            writer.writeError(errors[i].toString(this._errorDisplayMode) + os.EOL);
          }

          // Display a summary of why the task failed or succeeded
          if (errors.length) {
            writer.writeError(`${errors.length} Error${errors.length > 1 ? 's' : ''}!` + os.EOL);
          } else if (code) {
            writer.writeError('gulp returned error code: ' + code + os.EOL);
          }

          // Write the logs to disk
          this._writeLogsToDisk(writer);

          if (code || errors.length > 0) {
            reject(errors);
          } else {
            // Write deps on success.
            fsx.writeFileSync(currentDepsPath, JSON.stringify(currentPackageDeps, undefined, 2));

            resolve(TaskStatus.Success);
          }
        });
      }
    } catch (error) {
      console.log(error);

      // Write the logs to disk
      this._writeLogsToDisk(writer);
      reject([new TaskError('error', error.toString())]);
    }
  }

  // @todo #179371: add log files to list of things that get gulp cleaned
  private _writeLogsToDisk(writer: ITaskWriter): void {
    const logFilename: string = path.basename(this._rushProject.projectFolder);

    const stdout: string = writer.getStdOutput().replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    if (stdout) {
      fsx.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.log'), stdout);
    }

    const stderr: string = writer.getStdError().replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    if (stderr) {
      fsx.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.error.log'), stderr);
    }
  }
}

function _areShallowEqual(object1: Object, object2: Object, writer: ITaskWriter): boolean {
  for (const n in object1) {
    if (!(n in object2) || object1[n] !== object2[n]) {
      writer.writeLine(`Found mismatch: "${n}": "${object1[n]}" !== "${object2[n]}"`);
      return false;
    }
  }
  for (const n in object2) {
    if (!(n in object1)) {
      writer.writeLine(`Found new prop in obj2: "${n}" value="${object2[n]}"`);
      return false;
    }
  }
  return true;
}