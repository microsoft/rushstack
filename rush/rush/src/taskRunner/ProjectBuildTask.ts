/**
 * @file ProjectBuildTask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A TaskRunner task which cleans and builds a project
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ITaskWriter } from '@ms/interleaver';

import RushConfig from '../data/RushConfig';
import RushConfigProject from '../data/RushConfigProject';
import ErrorDetector, { ErrorDetectionMode } from '../errorDetection/ErrorDetector';
import { ITaskDefinition } from '../taskRunner/ITask';

import TaskError from '../errorDetection/TaskError';
import Utilities from '../utilities/Utilities';

export default class ProjectBuildTask implements ITaskDefinition {
  public name: string;

  private _hasError: boolean;
  private _errorDetector: ErrorDetector;
  private _errorDisplayMode: ErrorDetectionMode;
  private _rushProject: RushConfigProject;
  private _rushConfig: RushConfig;
  private _production: boolean;
  private _npmMode: boolean;

  constructor(rushProject: RushConfigProject,
              rushConfig: RushConfig,
              errorDetector: ErrorDetector,
              errorDisplayMode: ErrorDetectionMode,
              production: boolean,
              npmMode: boolean) {
    this.name = rushProject.packageName;
    this._errorDetector = errorDetector;
    this._errorDisplayMode = errorDisplayMode;
    this._production = production;
    this._npmMode = npmMode;
    this._rushProject = rushProject;
    this._rushConfig = rushConfig;
  }

  public execute(writer: ITaskWriter): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (errors: TaskError[]) => void) => {
      this._hasError = false;
      try {
        writer.writeLine(`>>> ProjectBuildTask :: Project [${this.name}]:`);
        const projectFolder: string = this._rushProject.projectFolder;

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
          this._hasError = true;
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

          if (code || this._hasError || errors.length > 0) {
            reject(errors);
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.log(error);

        // Write the logs to disk
        this._writeLogsToDisk(writer);
        reject([new TaskError('error', error.toString())]);
      }
    });
  }

  // @todo #179371: add log files to list of things that get gulp nuke'd
  private _writeLogsToDisk(writer: ITaskWriter): void {
    const logFilename: string = path.basename(this._rushProject.projectFolder);

    const stdout: string = writer.getStdOutput().replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    if (stdout) {
      fs.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.log'), stdout);
    }

    const stderr: string = writer.getStdError().replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    if (stderr) {
      fs.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.error.log'), stderr);
    }
  }
}
