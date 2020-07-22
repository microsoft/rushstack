// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';

import {
  PackageJsonLookup,
  IPackageJson,
  Text
 } from '@rushstack/node-core-library';
import { Utilities } from '../utilities/Utilities';
import { ProjectCommandSet } from '../logic/ProjectCommandSet';
import { RushConfiguration } from '../api/RushConfiguration';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';

/**
 * @internal
 */
export interface ILaunchRushXInternalOptions {
  isManaged: boolean;
  alreadyReportedNodeTooNewError?: boolean;
}

export class RushXCommandLine {
  public static launchRushX(launcherVersion: string, isManaged: boolean): void {
    RushXCommandLine._launchRushXInternal(launcherVersion, { isManaged });
  }

  /**
   * @internal
   */
  public static _launchRushXInternal(launcherVersion: string, options: ILaunchRushXInternalOptions): void {
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
        RushXCommandLine._showUsage(packageJson, projectCommandSet);
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

      const exitCode: number = Utilities.executeLifecycleCommand(
        scriptBody,
        {
          rushConfiguration,
          workingDirectory: packageFolder,
          // If there is a rush.json then use its .npmrc from the temp folder.
          // Otherwise look for npmrc in the project folder.
          initCwd: rushConfiguration ? rushConfiguration.commonTempFolder : packageFolder,
          handleOutput: false,
          environmentPathOptions: {
            includeProjectBin: true
          }
        }
      );

      if (exitCode > 0) {
        console.log(colors.red(`The script failed with exit code ${exitCode}`));
      }

      process.exitCode = exitCode;

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
