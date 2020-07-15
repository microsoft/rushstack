// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import * as os from 'os';

import { FileSystem } from '@rushstack/node-core-library';
import { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { Stopwatch } from '../../utilities/Stopwatch';
import { PurgeManager } from '../../logic/PurgeManager';
import { Utilities } from '../../utilities/Utilities';
import { PnpmProjectDependencyManifest } from '../../logic/pnpm/PnpmProjectDependencyManifest';

export class PurgeAction extends BaseRushAction {
  private _unsafeParameter: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'purge',
      summary:
        'For diagnostic purposes, use this command to delete caches and other temporary files used by Rush',
      documentation:
        'The "rush purge" command is used to delete temporary files created by Rush.  This is' +
        ' useful if you are having problems and suspect that cache files may be corrupt.',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._unsafeParameter = this.defineFlagParameter({
      parameterLongName: '--unsafe',
      description:
        '(UNSAFE!) Also delete shared files such as the package manager instances stored in' +
        ' the ".rush" folder in the user\'s home directory.  This is a more aggressive fix that is' +
        ' NOT SAFE to run in a live environment because it will cause other concurrent Rush processes to fail.'
    });
  }

  protected run(): Promise<void> {
    return Promise.resolve().then(() => {
      const stopwatch: Stopwatch = Stopwatch.start();

      const purgeManager: PurgeManager = new PurgeManager(this.rushConfiguration, this.rushGlobalFolder);

      this._deleteProjectFiles();

      if (this._unsafeParameter.value!) {
        purgeManager.purgeUnsafe();
      } else {
        purgeManager.purgeNormal();
      }

      purgeManager.deleteAll();

      console.log(
        os.EOL +
          colors.green(
            `Rush purge started successfully and will complete asynchronously. (${stopwatch.toString()})`
          )
      );
    });
  }

  /**
   * Delete:
   *  - all the node_modules symlinks of configured Rush projects
   *  - all of the project/.rush/temp/shrinkwrap-deps.json files of configured Rush projects
   *
   * Returns true if anything was deleted
   * */
  private _deleteProjectFiles(): boolean {
    let didDeleteAnything: boolean = false;

    for (const rushProject of this.rushConfiguration.projects) {
      const localModuleFolder: string = path.join(rushProject.projectFolder, 'node_modules');
      if (FileSystem.exists(localModuleFolder)) {
        console.log(`Purging ${localModuleFolder}`);
        Utilities.dangerouslyDeletePath(localModuleFolder);
        didDeleteAnything = true;
      }

      const projectDependencyManifestFilePath: string = PnpmProjectDependencyManifest.getFilePathForProject(
        rushProject
      );
      if (FileSystem.exists(projectDependencyManifestFilePath)) {
        console.log(`Deleting ${projectDependencyManifestFilePath}`);
        FileSystem.deleteFile(projectDependencyManifestFilePath);
        didDeleteAnything = true;
      }
    }

    return didDeleteAnything;
  }
}
