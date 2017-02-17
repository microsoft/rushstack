// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as fsx from 'fs-extra';

import * as os from 'os';
import * as path from 'path';
import { ITaskWriter } from '@microsoft/stream-collator';
import {
  RushConfiguration,
  RushConfigurationProject,
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

/**
 * A TaskRunner task which cleans and builds a project
 */
export default class ProjectBuildTask implements ITaskDefinition {
  public name: string;
  public isIncrementalBuildAllowed: boolean;

  private _errorDetector: ErrorDetector;
  private _errorDisplayMode: ErrorDetectionMode;
  private _rushProject: RushConfigurationProject;
  private _rushConfiguration: RushConfiguration;
  private _production: boolean;
  private _npmMode: boolean;
  private _minimalMode: boolean;

  private _hasWarningOrError: boolean;

  constructor(
    rushProject: RushConfigurationProject,
    rushConfiguration: RushConfiguration,
    errorDetector: ErrorDetector,
    errorDisplayMode: ErrorDetectionMode,
    production: boolean,
    npmMode: boolean,
    minimalMode: boolean,
    isIncrementalBuildAllowed: boolean
  ) {
    this.name = rushProject.packageName;
    this._errorDetector = errorDetector;
    this._errorDisplayMode = errorDisplayMode;
    this._production = production;
    this._npmMode = npmMode;
    this._rushProject = rushProject;
    this._rushConfiguration = rushConfiguration;
    this._minimalMode = minimalMode;
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
    this._hasWarningOrError = false;

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

        const clean: { command: string, args: string[] } = this._getScriptCommand('clean');
        const build: { command: string, args: string[] } =
          this._getScriptCommand('test') || this._getScriptCommand('build');

        if (!clean) {
          // tslint:disable-next-line:max-line-length
          throw new Error(`The project [${this._rushProject.packageName}] does not define a 'clean' command in the 'scripts' section of its package.json`);
        }

        if (!build) {
          // tslint:disable-next-line:max-line-length
          throw new Error(`The project [${this._rushProject.packageName}] does not define a 'test' or 'build' command in the 'scripts' section of its package.json`);
        }

        // Run the clean step
        if (!clean.command) {
          // tslint:disable-next-line:max-line-length
          writer.writeLine(`The clean command was registered in the package.json but is blank. Skipping 'clean' step...`);
        } else {
          const actualCleanCommand: string = `${clean.command} ${clean.args.join(' ')}`;
          writer.writeLine(actualCleanCommand);
          try {
            Utilities.executeCommand(clean.command, clean.args, projectFolder, true, process.env);
          } catch (error) {
            throw new Error(`There was a problem running the 'clean' script: ${os.EOL} ${error.toString()}`);
          }
        }

        if (!build.command) {
          // tslint:disable-next-line:max-line-length
          writer.writeLine(`The 'build' or 'test' command was registered in the package.json but is blank. Skipping 'clean' step...`);
          resolve(TaskStatus.Success);
          return;
        }

        // Normalize test command step
        build.args.push(this._errorDisplayMode === ErrorDetectionMode.VisualStudioOnline ? '--no-color' : '--color');

        if (this._production) {
          build.args.push('--production');
        }
        if (this._npmMode) {
          build.args.push('--npm');
        }
        if (this._minimalMode) {
          build.args.push('--minimal');
        }

        const actualBuildCommand: string = `${build.command} ${build.args.join(' ')}`;

        // Run the test step
        writer.writeLine(actualBuildCommand);
        const buildTask: child_process.ChildProcess = Utilities.executeCommandAsync(
          build.command, build.args, projectFolder, process.env);

        // Hook into events, in order to get live streaming of build log
        buildTask.stdout.on('data', (data: string) => {
          writer.write(data);
        });

        buildTask.stderr.on('data', (data: string) => {
          writer.writeError(data);
          this._hasWarningOrError = true;
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
            writer.writeError(`${clean.command} returned error code: ${code}${os.EOL}`);
          }

          // Write the logs to disk
          this._writeLogsToDisk(writer);

          if (code || errors.length > 0) {
            reject(errors);
          } else if (this._hasWarningOrError) {
            resolve(TaskStatus.SuccessWithWarning);
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

  private _getScriptCommand(script: string): { command: string, args: string[] } {
    // tslint:disable-next-line:no-string-literal
    if (!this._rushProject.packageJson.scripts) {
      return undefined;
    }

    const rawCommand: string = this._rushProject.packageJson.scripts[script];

    // tslint:disable-next-line:no-null-keyword
    if (rawCommand === undefined || rawCommand === null) {
      return undefined;
    }

    if (rawCommand === '') {
      return {
        command: undefined,
        args: undefined
      };
    }

    const command: string[] = rawCommand.split(' ');
    const commandArgs: string[] = command.splice(1);

    if (command[0] === 'gulp') {
      command[0] = path.join(this._rushConfiguration.commonFolder, 'node_modules', '.bin', command[0]);
    }

    return {
      command: command[0],
      args: commandArgs
    };
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