/**
 * @file ProjectBuildTask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A TaskRunner task which cleans and builds a project
 */

import * as path from 'path';
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

  constructor(config: IRushProjectConfig,
    errorDetector: ErrorDetector, errorDisplayMode: ErrorDetectionMode) {
    this.name = config.packageName;
    this._errorDetector = errorDetector;
    this._errorDisplayMode = errorDisplayMode;
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

        const fullPathToGulp = path.join(RushConfigLoader.getCommonFolder(), 'node_modules/.bin/gulp');

        writer.writeLine('gulp nuke');
        const gulpNukeResult = child_process.execSync(fullPathToGulp + ' nuke', { cwd: projectFolder });
        writer.writeLine(gulpNukeResult.toString());

        writer.writeLine('gulp bundle test');
        const buildTask = child_process.exec(fullPathToGulp + ' bundle test', options);

        buildTask.stdout.on('data', (data: string) => {
          writer.write(data);
        });

        buildTask.stderr.on('data', (data: string) => {
          writer.writeError(data);
        });

        buildTask.on('exit', (code: number) => {
          // @todo #168286: we should reject if we have an error code even if we didn't detect an error

          // Detect & display errors
          const errors = this._errorDetector.execute(writer.getOutput());
          for (let i = 0; i < errors.length; i++) {
            writer.writeError(errors[i].toString(this._errorDisplayMode) + '\n');
          }

          // Display a summary of why the task failed or succeeded
          if (errors.length) {
            writer.writeError(`${errors.length} Error${errors.length > 1 ? 's' : ''}! \n`);
          } else if (code !== 0) {
            writer.writeError('gulp returned error code: ' + code + '\n');
          }

          if (errors.length > 0 || code !== 0) {
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
