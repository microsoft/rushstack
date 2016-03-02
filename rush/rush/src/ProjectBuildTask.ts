/**
 * @file ProjectBuildTask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * A TaskRunner task which cleans and builds a project
 */

import * as path from 'path';
import * as child_process from 'child_process';

import RushConfigLoader, { IRushProjectConfig } from './RushConfigLoader';
import ErrorDetector, { ErrorDetectionMode } from './ErrorDetector';
import { ITaskDefinition } from './taskRunner/ITask';
import { ITaskWriter } from './taskRunner/TaskWriterFactory';

export default class ProjectBuildTask implements ITaskDefinition {
  public name: string;

  private _errorDetectionMode: ErrorDetectionMode;
  private _config: IRushProjectConfig;

  constructor(name: string, config: IRushProjectConfig, errorMode: ErrorDetectionMode) {
    this.name = name;
    this._errorDetectionMode = errorMode;
    this._config = config;
  }

  public execute(writer: ITaskWriter): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: () => void) => {
      // @todo - check that deps are actually resolved

      writer.writeLine(`>>> ProjectBuildTask :: Project [${this._config.path}]:`);
      const projectFolder = RushConfigLoader.getProjectFolder(this._config.path);

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
        const errors = ErrorDetector(writer.getOutput(), this._errorDetectionMode);
        for (let i = 0; i < errors.length; i++) {
          writer.writeError(errors[i] + '\n');
        }
        if (errors.length) {
          writer.writeError(`${errors.length} Error${errors.length > 1 ? 's' : ''}! \n`);
        }
        if (errors.length) {
          reject();
        } else {
          resolve();
        }
      });
    });
  }
}
