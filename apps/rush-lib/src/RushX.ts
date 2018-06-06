// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';

import {
  PackageJsonLookup,
  IPackageJson,
  Text,
  IPackageJsonScriptTable
 } from '@microsoft/node-core-library';
import { Utilities } from '../lib/utilities/Utilities';

export class RushX {

  public static launchRushX(launcherVersion: string, isManaged: boolean): void {
    // NodeJS can sometimes accidentally terminate with a zero exit code  (e.g. for an uncaught
    // promise exception), so we start with the assumption that the exit code is 1
    // and set it to 0 only on success.
    process.exitCode = 1;

    try {
      // Find the governing package.json for this folder:
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

      const packageJsonFilePath: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(process.cwd());
      if (!packageJsonFilePath) {
        console.log(colors.red('This command should be used inside a project folder.'));
        console.log(`Unable to find a package.json file in the current working directory or any of its parents.`);
        return;
      }

      const packageJson: IPackageJson = packageJsonLookup.loadPackageJson(packageJsonFilePath);

      // 0 = node.exe
      // 1 = rushx
      const args: string[] = process.argv.slice(2);

      if (args.length === 0 || args[0][0] === '-') {
        RushX._showUsage(packageJson);
        return;
      }

      const command: string = args[0];

      const scripts: IPackageJsonScriptTable = packageJson.scripts || { };

      if (!Object.hasOwnProperty.call(scripts, command)) {
        console.log(colors.red(`Error: The command "${command}" is not defined in the`
          + ` package.json file for this project.`));

        const availableCommands: string[] = Object.keys(scripts);
        if (availableCommands.length > 0) {
          console.log(os.EOL + 'Available commands for this project are: '
            + availableCommands.map(x => `"${x}"`).join(', '));
        }

        console.log(`Use ${colors.yellow('"rushx --help"')} for more information.`);
        return;
      }

      const scriptBody: string = scripts[command];
      console.log('Executing: ' + JSON.stringify(scriptBody) + os.EOL);

      const packageFolder: string = path.basename(packageJsonFilePath);

      const result: child_process.SpawnSyncReturns<Buffer> = Utilities.executeLifecycleCommand(
        scriptBody,
        packageFolder,
        packageFolder
      );

      // Return the exit code of the child process
      process.exitCode = result.status;
    } catch (error) {
      console.log(colors.red('Error: ' + error.message));
    }
  }

  private static _showUsage(packageJson: IPackageJson): void {
    console.log('usage: rushx [-h]');
    console.log('       rushx <command> ...' + os.EOL);

    console.log('Optional arguments:');
    console.log('  -h, --help            Show this help message and exit.' + os.EOL);

    const scripts: IPackageJsonScriptTable = packageJson.scripts || { };
    if (Object.keys(scripts).length > 0) {
      console.log(`Project commands for ${colors.cyan(packageJson.name)}:`);

      // Calculate the length of the longest script name, for formatting
      let maxLength: number = 0;
      for (const command of Object.keys(scripts)) {
        maxLength = Math.max(maxLength, command.length);
      }

      let warning: string | undefined = undefined;

      for (const command of Object.keys(scripts)) {
        if (command[0] === '-' || command.length === 0) {
          if (!warning) {
            warning = command;
          }
        } else {
          const escapedScriptBody: string = JSON.stringify(scripts[command]);

          // The length of the string e.g. "  command: "
          const firstPartLength: number = 2 + maxLength + 2;
          // The length for truncating the escaped escapedScriptBody so it doesn't wrap
          // to the next line
          const truncateLength: number = Math.max(0, Utilities.getConsoleWidth() - firstPartLength) - 1;

          console.log(
            // Example: "  command: "
            '  ' + colors.cyan(Text.padEnd(command + ':', maxLength + 2))
            // Example: "do some thin..."
            + Text.truncateWithEllipsis(escapedScriptBody, truncateLength)
          );
        }
      }

      if (warning) {
        console.log(os.EOL + colors.yellow('Warning: The "scripts" table in the package.json file'
          + ` defines a script with an unsupported name: "${warning}"`));
      }
    } else {
      console.log(colors.yellow('Warning: No commands are defined yet for this project.'));
      console.log('You can define a command by adding a "scripts" table to the project\'s package.json file.');
    }
  }
}
