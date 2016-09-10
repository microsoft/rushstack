/**
 * @file ProjectBuildTask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A TaskRunner task which cleans and builds a project
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as colors from 'colors';
import * as path from 'path';

import { DualTaskStream } from '@ms/console-moderator';

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

  public execute(writer: DualTaskStream): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (errors: TaskError[]) => void) => {
      this._hasError = false;
      try {
        writer.stdout.write(`Project: [${this.name}]${os.EOL}`);
        const projectFolder: string = this._rushProject.projectFolder;

        writer.stdout.write(`npm run clean${os.EOL}`);
        Utilities.executeCommand(this._rushConfig.npmToolFilename, ['run', 'clean'],
          projectFolder, /* suppressOutput */ true);

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
        writer.stdout.write('npm ' + args.join(' ') + os.EOL);

        const buildTask: child_process.ChildProcess = Utilities.executeCommandAsync(
          this._rushConfig.npmToolFilename, args, projectFolder);

        buildTask.stdout.pipe(writer.stdout);

        buildTask.stderr.on('data', (data: string) => {
          this._hasError = true;
          writer.stderr.write(data);
        });

        buildTask.on('close', (code: number) => {
          // Detect & display errors
          const errors: TaskError[] = this._errorDetector.execute(
            writer.stdout.readAll() + os.EOL + writer.stderr.readAll());

          for (let i: number = 0; i < errors.length; i++) {
            writer.push(colors.red(errors[i].toString(this._errorDisplayMode) + os.EOL));
          }

          // Display a summary of why the task failed or succeeded
          if (errors.length) {
            writer.push(colors.red(`${errors.length} Error${errors.length > 1 ? 's' : ''}!` + os.EOL));
          } else if (code) {
            writer.push(colors.red('gulp returned error code: ' + code + os.EOL));
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
  private _writeLogsToDisk(writer: DualTaskStream): void {
    const logFilename: string = path.basename(this._rushProject.projectFolder);
    const colorCodeRegex: RegExp = /\x1B[[(?);]{0,2}(;?\d)*./g;

    const stdout: string = writer.stdout.readAll().replace(colorCodeRegex, '');
    if (stdout) {
      fs.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.log'), stdout);
    }

    const stderr: string = writer.stdout.readAll().replace(colorCodeRegex, '');
    if (stderr) {
      fs.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.error.log'), stderr);
    }
  }
}
