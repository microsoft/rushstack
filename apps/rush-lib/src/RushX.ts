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

/**
 * Parses the "scripts" section from package.json
 */
class ProjectCommandSet {
  public readonly malformedScriptNames: string[] = [];
  public readonly commandNames: string[] = [];
  private readonly _scriptsByName: Map<string, string> = new Map<string, string>();

  public constructor(packageJson: IPackageJson) {
    const scripts: IPackageJsonScriptTable = packageJson.scripts || { };

    for (const scriptName of Object.keys(scripts)) {
      if (scriptName[0] === '-' || scriptName.length === 0) {
        this.malformedScriptNames.push(scriptName);
      } else {
        this.commandNames.push(scriptName);
        this._scriptsByName.set(scriptName, scripts[scriptName]);
      }
    }

    this.commandNames.sort();
  }

  public tryGetScriptBody(commandName: string): string | undefined {
    return this._scriptsByName.get(commandName);
  }

  public getScriptBody(commandName: string): string {
    const result: string | undefined = this.tryGetScriptBody(commandName);
    if (result === undefined) {
      throw new Error(`The command "${commandName}" was not found`);
    }
    return result;
  }
}

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

      const projectCommandSet: ProjectCommandSet = new ProjectCommandSet(packageJson);

      // 0 = node.exe
      // 1 = rushx
      const args: string[] = process.argv.slice(2);

      // Check for the following types of things:
      //   rush
      //   rush --help
      //   rush -h
      //   rush --unrecognized-option
      if (args.length === 0 || args[0][0] === '-') {
        RushX._showUsage(packageJson, projectCommandSet);
        return;
      }

      const commandName: string = args[0];

      const scriptBody: string | undefined = projectCommandSet.tryGetScriptBody(commandName);

      if (scriptBody === undefined) {
        console.log(colors.red(`Error: The command "${commandName}" is not defined in the`
          + ` package.json file for this project.`));

        if (projectCommandSet.commandNames.length > 0) {
          console.log(os.EOL + 'Available commands for this project are: '
            + projectCommandSet.commandNames.map(x => `"${x}"`).join(', '));
        }

        console.log(`Use ${colors.yellow('"rushx --help"')} for more information.`);
        return;
      }

      console.log('Executing: ' + JSON.stringify(scriptBody) + os.EOL);

      const packageFolder: string = path.dirname(packageJsonFilePath);

      const result: child_process.ChildProcess = Utilities.executeLifecycleCommandAsync(
        scriptBody,
        packageFolder,
        packageFolder
      );

      result.on('close', (code) => {
        if (code) {
          console.log(colors.red(`The script failed with exit code ${code}`));
        }

        // Pass along the exit code of the child process
        process.exitCode = code || 0;
      });
    } catch (error) {
      console.log(colors.red('Error: ' + error.message));
    }
  }

  private static _showUsage(packageJson: IPackageJson, projectCommandSet: ProjectCommandSet): void {
    console.log('usage: rushx [-h]');
    console.log('       rushx <command> ...' + os.EOL);

    console.log('Optional arguments:');
    console.log('  -h, --help            Show this help message and exit.' + os.EOL);

    if (projectCommandSet.commandNames.length > 0) {
      console.log(`Project commands for ${colors.cyan(packageJson.name)}:`);

      // Calculate the length of the longest script name, for formatting
      let maxLength: number = 0;
      for (const commandName of projectCommandSet.commandNames) {
        maxLength = Math.max(maxLength, commandName.length);
      }

      for (const commandName of projectCommandSet.commandNames) {
        const escapedScriptBody: string = JSON.stringify(projectCommandSet.getScriptBody(commandName));

        // The length of the string e.g. "  command: "
        const firstPartLength: number = 2 + maxLength + 2;
        // The length for truncating the escaped escapedScriptBody so it doesn't wrap
        // to the next line
        const truncateLength: number = Math.max(0, Utilities.getConsoleWidth() - firstPartLength) - 1;

        console.log(
          // Example: "  command: "
          '  ' + colors.cyan(Text.padEnd(commandName + ':', maxLength + 2))
          // Example: "do some thin..."
          + Text.truncateWithEllipsis(escapedScriptBody, truncateLength)
        );
      }

      if (projectCommandSet.malformedScriptNames.length > 0) {
        console.log(os.EOL + colors.yellow('Warning: Some "scripts" entries in the package.json file'
          + ' have malformed names: '
          + projectCommandSet.malformedScriptNames.map(x => `"${x}"`).join(', ')));
      }
    } else {
      console.log(colors.yellow('Warning: No commands are defined yet for this project.'));
      console.log('You can define a command by adding a "scripts" table to the project\'s package.json file.');
    }
  }
}
