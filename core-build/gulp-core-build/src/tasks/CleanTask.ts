// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from './GulpTask';
import * as Gulp from 'gulp';

import { FileDeletionUtility } from '../utilities/FileDeletionUtility';
import { IBuildConfig } from './../IBuildConfig';

/**
 * The clean task is a special task which iterates through all registered
 * tasks and subtasks, collecting a list of patterns which should be deleted.
 * An instance of this task is automatically registered to the 'clean' command.
 * @public
 */
export class CleanTask extends GulpTask<void> {
  /**
   * Instantiates a new CleanTask with the name 'clean'
   */
  constructor() {
    super('clean');
  }

  /**
   * The main function, which iterates through all uniqueTasks registered
   * to the build, and by calling the getCleanMatch() function, collects a list of
   * glob patterns which are then passed to the `del` plugin to delete them from disk.
   */
  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): void {
    const { distFolder, libFolder, libAMDFolder, tempFolder }: IBuildConfig = this.buildConfig;
    let cleanPaths: string[] = [distFolder, libFolder, tempFolder];

    if (libAMDFolder) {
      cleanPaths.push(libAMDFolder);
    }

    // Give each registered task an opportunity to add their own clean paths.
    for (const executable of this.buildConfig.uniqueTasks || []) {
      if (executable.getCleanMatch) {
        // Set the build config, as tasks need this to build up paths
        cleanPaths = cleanPaths.concat(executable.getCleanMatch(this.buildConfig));
      }
    }

    const uniquePaths: { [key: string]: string } = {};

    // Create dictionary of unique paths. (Could be replaced with ES6 set.)
    cleanPaths.forEach(cleanPath => {
      if (!!cleanPath) {
        uniquePaths[cleanPath] = cleanPath;
      }
    });

    // Reset cleanPaths to only unique non-empty paths.
    cleanPaths = [];
    for (const uniquePath in uniquePaths) {
      if (uniquePaths.hasOwnProperty(uniquePath)) {
        cleanPaths.push(uniquePath);
      }
    }

    try {
      FileDeletionUtility.deletePatterns(cleanPaths);
      completeCallback();
    } catch (e) {
      completeCallback(e);
    }
  }
}
