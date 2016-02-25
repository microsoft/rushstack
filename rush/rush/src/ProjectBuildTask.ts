import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import colors = require('colors');

import { IRushProjectConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink'; // todo refactor helper funcs
import ErrorDetector, { ErrorDetectionMode } from './ErrorDetector';
import ITask from './taskRunner/ITask';
import TaskStatus from './taskRunner/TaskStatus';
import { ITaskWriter } from './taskRunner/TaskWriterFactory';

/**
 * Returns the folder path for the specified project, e.g. "./lib1"
 * for "lib1".  Reports an error if the folder does not exist.
 */
function getProjectFolder(project: string): string {
  let projectFolder = path.join(path.resolve('.'), project);
  if (!fs.existsSync(projectFolder)) {
    throw new Error(`Project folder not found: ${project}`);
  }
  return projectFolder;
}

export default class ProjectBuildTask implements ITask {
  public name: string;
  public dependencies: Array<ITask> = new Array<ITask>();
  public dependents: Array<ITask> = new Array<ITask>();

  private _errorDetectionMode: ErrorDetectionMode;
  private _config: IRushProjectConfig;

  constructor(name: string, config: IRushProjectConfig, errorMode: ErrorDetectionMode) {
    this.name = name;
    this._errorDetectionMode = errorMode;
    this._config = config;
  }

  get status(): TaskStatus {
    return TaskStatus.Blocked;
  }

  public execute(writer: ITaskWriter): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: () => void) => {
      //@todo  check that deps are actually resolved

      writer.writeLine(`> Project [${this._config.path}]:`);
      const projectFolder = getProjectFolder(this._config.path);

      const options = {
        cwd: projectFolder,
        stdio: [0, 1, 2] // (omit this to suppress gulp console output)
      };

      const fullPathToGulp = path.join(getCommonFolder(), 'node_modules/.bin/gulp');

      writer.writeLine('gulp nuke');
      // child_process.execSync(fullPathToGulp + ' nuke', options);

      writer.writeLine('gulp test');
      const buildTask = child_process.exec(fullPathToGulp + ' test', options);

      buildTask.stdout.on('data', (data: string) => {
        writer.write(data);
      });

      buildTask.stderr.on('data', (data: string) => {
        writer.write(colors.red(data));
      });

      buildTask.on('exit', (code: number) => {
        const errors = ErrorDetector(writer.getOutput(), this._errorDetectionMode);
        for (let i = 0; i < errors.length; i++) {
          writer.writeLine(colors.red(errors[i]));
        }
        writer.write(`> Finished [${this.name}]`);
        if (errors.length) {
          writer.write(colors.red(` ${errors.length} Errors!!`));
        }
        writer.writeLine('');

        if (errors.length) {
          reject();
        } else {
          resolve();
        }
      });
    });
  }
}
