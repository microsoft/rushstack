/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import colors = require('colors');
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink';
import TaskOutputManager from './TaskOutputManager';
import { lintRegex, tscRegex, testRegex } from './ErrorDetector';

const OutputManager = new TaskOutputManager();

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

function buildProject(projectName: string): Promise<void> {
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
      // note that data does not return the whole line, so we may need to does
      // some hackery here to make sure we are scanning whole individual lines 
      write(data);
      checkForError(data, writeLine);
    });

    buildTask.stderr.on('data', (data: string) => {
      write(colors.red(data));
    });

    buildTask.on('exit', (code: number) => {
      writeLine(`> Finished [${projectName}]!`);
      OutputManager.completeTask(projectName);
      resolve();
    });
  });
}

function checkForError(line: string, write: (message: string) => void) {
  let match = lintRegex.exec(line);
  if (match) {
    write(colors.yellow(formatVsoError(`${match[4]}(${match[5]}): [tslint] ${match[6]}`)));
  } else {
    match = tscRegex.exec(line);
    if (match) {
      write(colors.yellow(formatVsoError(`${match[1]}${match[2]} [tsc] ${match[3]}`)));
    } else {
      match = testRegex.exec(line);
      if (match) {
        write(colors.red(formatVsoError('[test] ' + match[1])));
      }
    }
  }
}

function formatVsoError(errorMessage: string) {
  return `##vso[task.logissue type=error;]${errorMessage}`;
}

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  let config: IRushConfig = RushConfigLoader.load();

  let promiseChain: Promise<void> = undefined;
  config.projects.forEach((project) => {
    if (!promiseChain) {
      promiseChain = buildProject(project);
    } else {
      promiseChain = promiseChain.then(() => buildProject(project));
    }
  });
  promiseChain.then(() => {
    console.log('');
    console.log('Done!');
  });
};

