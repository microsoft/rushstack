/**
 * @file ProjectBuildTask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A TaskRunner task which cleans and builds a project
 */

import * as child_process from 'child_process';

import RushConfigLoader, { IRushProjectConfig } from './RushConfigLoader';
import ErrorDetector, { ErrorDetectionMode } from './errorDetection/ErrorDetector';
import { ITaskDefinition } from './taskRunner/ITask';
import { ITaskWriter } from './taskRunner/TaskWriterFactory';
import TaskError from './errorDetection/TaskError';

export default class ProjectBuildTask implements ITaskDefinition {
  public name: string;

  private _errorDetector: ErrorDetector;
  private _errorDisplayMode: ErrorDetectionMode;
  private _config: IRushProjectConfig;
  private _production: boolean;

  constructor(config: IRushProjectConfig,
              errorDetector: ErrorDetector,
              errorDisplayMode: ErrorDetectionMode,
              production: boolean) {
    this.name = config.packageName;
    this._errorDetector = errorDetector;
    this._errorDisplayMode = errorDisplayMode;
    this._production = production;
    this._config = config;
  }

  public execute(writer: ITaskWriter): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (errors: TaskError[]) => void) => {
      try {
        writer.writeLine(`>>> ProjectBuildTask :: Project [${this.name}]:`);
        const projectFolder = RushConfigLoader.getProjectFolder(this._config.projectFolder);

        const options = {
          cwd: projectFolder,
          stdio: [0, 1, 2] // (omit this to suppress gulp console output)
        };

        writer.writeLine('npm run clean');
        const gulpNukeResult = child_process.execSync('npm run clean', { cwd: projectFolder });
        writer.writeLine(gulpNukeResult.toString());

        const command = `npm run test${this._production ? ' -- --production' : ''}`;
        writer.writeLine(command);
        const buildTask = child_process.exec(command, options);

        buildTask.stdout.on('data', (data: string) => {
          writer.write(data);
        });

        buildTask.stderr.on('data', (data: string) => {
          writer.writeError(data);
        });

        buildTask.on('exit', (code: number) => {
          // Detect & display errors
          const errors = this._errorDetector.execute(writer.getOutput());
          for (let i = 0; i < errors.length; i++) {
            writer.writeError(errors[i].toString(this._errorDisplayMode) + '\n');
          }

          // Display a summary of why the task failed or succeeded
          if (errors.length) {
            writer.writeError(`${errors.length} Error${errors.length > 1 ? 's' : ''}! \n`);
          } else if (code) {
            writer.writeError('gulp returned error code: ' + code + '\n');
          }

          if (errors.length > 0 || code) {
            reject(errors);
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.log(error);
        reject([new TaskError('error', error.toString())]);
      }
    });
  }
}
