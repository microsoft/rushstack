/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as fs from 'fs';

/**
 * For a scoped NPM package name this separates the scope and name parts.  For example:
 * parseScopedPackgeName('@my-scope/myproject') = { scope: '@my-scope', name: 'myproject' }
 * parseScopedPackgeName('myproject') = { scope: '', name: 'myproject' }
 */
export function parseScopedPackgeName(scopedName: string): { scope: string, name: string } {
  if (scopedName.substr(0, 1) !== '@') {
    return { scope: '', name: scopedName };
  }

  const slashIndex: number = scopedName.indexOf('/');
  if (slashIndex >= 0) {
    return { scope: scopedName.substr(0, slashIndex), name: scopedName.substr(slashIndex + 1) };
  } else {
    throw new Error('Invalid scoped name: ' + scopedName);
  }
}

/**
 * NodeJS equivalent of performance.now().
 */
export function performance_now(): number {
  let seconds: number;
  let nanoseconds: number;
  [seconds, nanoseconds] = process.hrtime();
  return seconds * 1000 + nanoseconds / 1000000;
}

export function createFolderWithRetry(folderName: string): void {
  // We need to do a simple "fs.mkdirSync(localModulesFolder)" here,
  // however if the folder we deleted above happened to contain any files,
  // then there seems to be some OS process (virus scanner?) that holds
  // a lock on the folder for a split second, which causes mkdirSync to
  // fail.  To workaround that, retry for up to 7 seconds before giving up.
  const startTime: number = performance_now();
  let looped: boolean = false;
  while (true) {
    try {
      fs.mkdirSync(folderName);
      break;
    } catch (e) {
      looped = true;
      const currentTime: number = performance_now();
      if (currentTime - startTime > 7000) {
        throw e;
      }
    }
  }
  if (looped) {
    const currentTime: number = performance_now();
    console.log('createFolderWithRetry() stalled for '
      + (currentTime - startTime).toString() + ' ms');
  }
}
