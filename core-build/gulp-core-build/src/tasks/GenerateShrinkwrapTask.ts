// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import gulpType = require('gulp');
import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { GulpTask } from './GulpTask';

/**
 * This provides a convenient way to more consistently generate a shrinkwrap file in
 * a desired manner as a gulp task, as there are many consistency issues with just
 * running npm-shrinkwrap directly.
 * @public
 */
export class GenerateShrinkwrapTask extends GulpTask<void> {
  /**
   * Instantiates a GenerateShrinkwrap task which will regenerate the shrinkwrap for a particular project
   */
  public constructor() {
    super('generate-shrinkwrap');
  }

  /**
   * Runs npm `prune` and `update` on a package before running `shrinkwrap --dev`
   */
  public executeTask(
    gulp: gulpType.Gulp,
    completeCallback: (error?: string | Error) => void
  ): NodeJS.ReadWriteStream | void {
    const pathToShrinkwrap: string = path.join(this.buildConfig.rootPath, 'npm-shrinkwrap.json');

    if (this.fileExists(pathToShrinkwrap)) {
      this.log(`Remove existing shrinkwrap file.`);
      this._dangerouslyDeletePath(pathToShrinkwrap);
    }

    this.log(`Running npm prune`);
    child_process.execSync('npm prune');

    this.log(`Running npm update`);
    child_process.execSync('npm update');

    this.log(`Running npm shrinkwrap --dev`);
    child_process.execSync('npm shrinkwrap --dev');

    completeCallback();
    return;
  }

  private _dangerouslyDeletePath(folderPath: string): void {
    try {
      FileSystem.deleteFolder(folderPath);
    } catch (e) {
      throw new Error(`${e.message}${os.EOL}Often this is caused by a file lock from a process
       such as your text editor, command prompt, or "gulp serve"`);
    }
  }
}
