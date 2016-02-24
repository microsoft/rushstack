/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import colors = require('colors');
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink';
import TaskOutputManager from './TaskOutputManager';
import ErrorDetector, { ErrorDetectionMode } from './ErrorDetector';

const OutputManager: TaskOutputManager = new TaskOutputManager();

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

function buildProject(projectName: string, mode: ErrorDetectionMode): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: () => void) => {
    const { write, writeLine } = OutputManager.registerTask(projectName);

    writeLine(`> Project [${projectName}]:`);
    const projectFolder = getProjectFolder(projectName);

    const options = {
      cwd: projectFolder,
      stdio: [0, 1, 2] // (omit this to suppress gulp console output)
    };

    const fullPathToGulp = path.join(getCommonFolder(), 'node_modules/.bin/gulp');

    writeLine('gulp nuke');
    child_process.execSync(fullPathToGulp + ' nuke', options);

    writeLine('gulp test');
    const buildTask = child_process.exec(fullPathToGulp + ' test', options);

    buildTask.stdout.on('data', (data: string) => {
      write(data);
    });

    buildTask.stderr.on('data', (data: string) => {
      write(colors.red(data));
    });

    buildTask.on('exit', (code: number) => {
      const errors = ErrorDetector(OutputManager.getTaskOutput(projectName), mode);
      for (let i = 0; i < errors.length; i++) {
        writeLine(colors.red(errors[i]));
      }
      write(`> Finished [${projectName}]`);
      if (errors.length) {
        write(colors.red(` ${errors.length} Errors!!`));
      }
      writeLine('\n');

      OutputManager.completeTask(projectName);
      if (errors.length) {
        reject();
      } else {
        resolve();
      }
    });
  });
}

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  let config: IRushConfig = RushConfigLoader.load();
  let errorMode: ErrorDetectionMode = (params.vso ?
    ErrorDetectionMode.VisualStudioOnline : ErrorDetectionMode.LocalBuild);

  let promiseChain: Promise<void> = undefined;
  config.projects.forEach((project) => {
    if (!promiseChain) {
      promiseChain = buildProject(project, errorMode);
    } else {
      promiseChain = promiseChain.then(() => buildProject(project, errorMode));
    }
  });
  promiseChain.then(() => {
    console.log('');
    console.log('Done!');
  });
};

