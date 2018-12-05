// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from './GulpTask';
import * as Gulp from 'gulp';
import * as path from 'path';
import * as child_process from 'child_process';

import { JsonFile } from '@microsoft/node-core-library';

export interface IBuildReceiptTask {
}

const PROCESS_OUTPUT_DELIMITER: string = '///~X~X~X~X~X~X~///';

let _lastLocalHashes: { [path: string]: string } = {};

/**
 * This task is responsible for generating a build receipt, which is a hash of filePath to sha1 git hash,
 * based on the current folder's content. If a {buildConfig.packagePath}/build.json file exists, it will
 * parse it and object compare the computed build receipt with the contents. If everything is the same, it
 * will set buildConfig.isRedundantBuild flag to true, which can be used in task isEnabled methods to skip
 * unnecessary work.
 *
 * The utility function "_getLocalHashes" will use the git.exe process to get the hashes from the git
 * cache. It also asks for git status, which will tell us what has been changed since. It uses this info
 * to build the hash.
 *
 * The utility function "_readPackageHashes" will read the local build.json file from the packagePath
 * folder.
 */
export class CheckBuildReceiptTask extends GulpTask<IBuildReceiptTask> {
  public name: string = 'check-for-changes';
  public executeTask(
    gulp: typeof Gulp,
    completeCallback: (error?: string | Error) => void
  ): Promise<Object> | NodeJS.ReadWriteStream | void {
    _getLocalHashes()
      .then(localHashes => {
        _lastLocalHashes = localHashes;
        _readPackageHashes(path.join(process.cwd(), this.buildConfig.packageFolder, 'build.json'))
          .then(packageHashes => {
            if (packageHashes) {
              if (_areObjectsEqual(localHashes, packageHashes)) {
                this.buildConfig.isRedundantBuild = true;
                this.log('Build is redundant. Skipping steps.');
              } else {
                _areObjectsEqual(localHashes, packageHashes);
                this.log('Build has new content, continuing execution.');
              }
            }
            completeCallback();
          })
          .catch(console.error);
      })
      .catch(console.error);
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
    gulp: typeof Gulp,
    completeCallback: (error?: string | Error) => void
  ): Promise<Object> | NodeJS.ReadWriteStream | void {

    const packageHashPath: string = path.join(process.cwd(), this.buildConfig.packageFolder, 'build.json');

    JsonFile.save(_lastLocalHashes, packageHashPath);
    completeCallback();
  }
}

function _getLocalHashes(): Promise<{ [path: string]: string }> {
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

function _readPackageHashes(receiptPath: string): Promise<{ [path: string]: string }> {
  return new Promise((complete) => {
    complete(JsonFile.load(receiptPath));
  });
}

function _areObjectsEqual(obj1: Object, obj2: Object): boolean {
  const obj1Keys: string[] = Object.keys(obj1);
  const obj2Keys: string[] = Object.keys(obj2);

  if (obj1Keys.length === obj2Keys.length) {
    for (const key of obj1Keys) {
      if (obj1[key] !== obj2[key]) {
        return false;
      }
    }

    return true;
  }

  return false;
}
