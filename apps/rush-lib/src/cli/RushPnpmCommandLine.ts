// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import colors from 'colors/safe';
import { FileSystem, AlreadyReportedError, Executable, EnvironmentMap } from '@rushstack/node-core-library';
import { PrintUtilities } from '@rushstack/terminal';

import { RushConfiguration } from '../api/RushConfiguration';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';
import { SpawnSyncReturns } from 'child_process';

export interface ILaunchRushPnpmInternalOptions {
  isManaged: boolean;
  alreadyReportedNodeTooNewError?: boolean;
}

export class RushPnpmCommandLine {
  public static launch(launcherVersion: string, options: ILaunchRushPnpmInternalOptions): void {
    // Node.js can sometimes accidentally terminate with a zero exit code  (e.g. for an uncaught
    // promise exception), so we start with the assumption that the exit code is 1
    // and set it to 0 only on success.
    process.exitCode = 1;

    try {
      // Are we in a Rush repo?
      let rushConfiguration: RushConfiguration | undefined = undefined;
      if (RushConfiguration.tryFindRushJsonLocation()) {
        rushConfiguration = RushConfiguration.loadFromDefaultLocation({ showVerbose: true });
      }

      NodeJsCompatibility.warnAboutCompatibilityIssues({
        isRushLib: true,
        alreadyReportedNodeTooNewError: !!options.alreadyReportedNodeTooNewError,
        rushConfiguration
      });

      if (!rushConfiguration) {
        throw new Error(
          'The "rush-pnpm" command must be executed in a folder that is under a Rush workspace folder'
        );
      }

      if (rushConfiguration.packageManager !== 'pnpm') {
        throw new Error(
          'The "rush-pnpm" command requires your rush.json to be configured to use the PNPM package manager'
        );
      }

      if (!rushConfiguration.pnpmOptions.useWorkspaces) {
        throw new Error(
          'The "rush-pnpm" command requires the "useWorkspaces" setting to be enabled in rush.json'
        );
      }

      const workspaceFolder: string = rushConfiguration.commonTempFolder;
      const workspaceFilePath: string = path.join(workspaceFolder, 'pnpm-workspace.yaml');

      if (!FileSystem.exists(workspaceFilePath)) {
        console.error(colors.red('Error: The PNPM workspace file has not been generated:'));
        console.error(`  ${colors.red(workspaceFilePath)}\n`);
        console.error(colors.cyan(`Do you need to run "rush install" or "rush update"?`));
        throw new AlreadyReportedError();
      }

      if (!FileSystem.exists(rushConfiguration.packageManagerToolFilename)) {
        console.error(colors.red('Error: The PNPM local binary has not been installed yet.'));
        console.error('\n' + colors.cyan(`Do you need to run "rush install" or "rush update"?`));
        throw new AlreadyReportedError();
      }

      // 0 = node.exe
      // 1 = rush-pnpm
      const originalArgs: string[] = process.argv.slice(2);

      const pnpmArgs: string[] = [];

      if (rushConfiguration.pnpmOptions.pnpmStorePath) {
        pnpmArgs.push('--store');
        pnpmArgs.push(rushConfiguration.pnpmOptions.pnpmStorePath);
      }

      pnpmArgs.push(...originalArgs);

      const pnpmEnvironmentMap: EnvironmentMap = new EnvironmentMap(process.env);
      pnpmEnvironmentMap.set('NPM_CONFIG_WORKSPACE_DIR', workspaceFolder);

      const result: SpawnSyncReturns<string> = Executable.spawnSync(
        rushConfiguration.packageManagerToolFilename,
        pnpmArgs,
        {
          environmentMap: pnpmEnvironmentMap,
          stdio: 'inherit'
        }
      );
      if (result.error) {
        throw new Error('Failed to invoke PNPM: ' + result.error);
      }
      if (result.status === null) {
        throw new Error('Failed to invoke PNPM: Spawn completed without an exit code');
      }
      process.exitCode = result.status;

      console.log('\nFinished rush-pnpm');
    } catch (error) {
      if (!(error instanceof AlreadyReportedError)) {
        const prefix: string = 'ERROR: ';
        console.error('\n' + colors.red(PrintUtilities.wrapWords(prefix + error.message)));
      }
    }
  }
}
