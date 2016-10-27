import { GulpTask } from './GulpTask';
import gulp = require('gulp');
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

export interface IBuildReceiptTask {
}

const PROCESS_OUTPUT_DELIMITER: string = '~X~X~X~X~X~X~';

let _lastLocalHashes: { [path: string]: string } = {};

/**
 * This task is responsible for the following:
 *
 * 1. Gather the local files build receipt of the current files. Cache it in _lastFilesHash for later use.
 *
 * 2. Check for the existence of a package build receipt. If none exists, complete the task.
 *
 * 3. Compare the package build hashes with the local build hashes. If they match, update the buildConfig to
 *    have isRedundantBuild flat set to true. This allows other tasks to completely prematurely.
 */
export class CheckBuildReceiptTask extends GulpTask<IBuildReceiptTask> {
  public name: string = 'check-for-changes';
  public executeTask(
    gulp: gulp.Gulp,
    completeCallback: (result?: Object) => void
  ): Promise<Object> | NodeJS.ReadWriteStream | void {

    getLocalHashes().then(localHashes => {
      _lastLocalHashes = localHashes;
      debugger;
      readPackageHashes(path.join(process.cwd(), this.buildConfig.packageFolder, 'build.json')).then(packageHashes => {
        if (packageHashes) {
          if (areObjectsEqual(localHashes, packageHashes)) {
            this.buildConfig.isRedundantBuild = true;
            this.log('Build is redundant. Skipping steps.');
          } else {
            debugger;
            areObjectsEqual(localHashes, packageHashes);
            this.log('Build has new content, continuing execution.');
          }
        }
        completeCallback();
      });
    });
  }
}

/**
 * This task writes _lastFilesHash, generated from the CheckBuildReceipt task, to the package path in the
 * build.json file. It should only be executed in a task which runs the CheckBuildReceipt subtask first, and
 * should only be run at the end of the task when everything has successfully completed.
 */
export class UpdateBuildReceiptTask extends GulpTask<IBuildReceiptTask> {
  public name: string = 'mark-changes';
  public executeTask(
    gulp: gulp.Gulp,
    completeCallback: (result?: Object) => void
  ): Promise<Object> | NodeJS.ReadWriteStream | void {

    let packageHashPath: string = path.join(process.cwd(), this.buildConfig.packageFolder, 'build.json');

    fs.writeFile(packageHashPath, JSON.stringify(_lastLocalHashes, undefined, 2), completeCallback);
  }
}

function getLocalHashes(): Promise<{ [path: string]: string }> {
  return new Promise((complete) => {
    child_process.exec(
      `git ls-tree HEAD -r && echo ${PROCESS_OUTPUT_DELIMITER} && git status --s -u .`,
      { cwd: process.cwd() },
      (error: Error, stdout: string) => {
        const fileHashes: { [path: string]: string } = {};
        const processOutputBlocks: string[] = stdout.split(PROCESS_OUTPUT_DELIMITER + '\n');

        processOutputBlocks[0].split('\n').forEach(line => {
          if (line) {
            const parts: string[] = line.substr(line.indexOf('blob ') + 5).split('\t');
            fileHashes[parts[1]] = parts[0];
          }
        });

      if (processOutputBlocks[1]) {
        const changedFiles: string[] =
          processOutputBlocks[1]
            .split('\n')
            .map(line => line.trim().split(' ')[1]).filter(name => !!name);

        if (changedFiles.length) {
          child_process.exec(
            'git hash-object ' + changedFiles.join(' '),
            { cwd: process.cwd() },
            (hashError: Error, hashStdout: string) => {
            const hashes: string[] = hashStdout.split('\n');

            changedFiles.forEach((filename, i) => fileHashes[filename] = hashes[i]);

            complete(fileHashes);
          });
        }
      } else {
        complete(fileHashes);
      }
    });

  });
}

function readPackageHashes(receiptPath: string): Promise<{ [path: string]: string }> {
  return new Promise((complete) => {
    fs.readFile(receiptPath, 'utf8', (err, data) => {
      complete(err ? undefined : JSON.parse(data));
    });
  });
}

function areObjectsEqual(obj1: Object, obj2: Object): boolean {
  let obj1Keys: string[] = Object.keys(obj1);
  let obj2Keys: string[] = Object.keys(obj2);

  if (obj1Keys.length === obj2Keys.length) {
    for (let key of obj1Keys) {
      if (obj1[key] !== obj2[key]) {
        return false;
      }
    }

    return true;
  }

  return false;
}
