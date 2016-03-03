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
import TaskError, { ProjectTaskError } from './errorDetection/TaskError';

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
      // @todo - check that deps are actually resolved

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
          const errors = this._errorDetector.execute(writer.getOutput());
          for (let i = 0; i < errors.length; i++) {
            writer.writeError(errors[i].toString(this._errorDisplayMode) + '\n');
          }
          if (errors.length) {
            writer.writeError(`${errors.length} Error${errors.length > 1 ? 's' : ''}! \n`);
          }
          if (errors.length) {
            reject(errors);
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.log(error);
        const taskError = new ProjectTaskError(undefined, undefined, undefined, 'error', error.toString());
        reject([taskError]);
      }
    });
  }
}
