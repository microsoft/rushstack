// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import {
  PackageJsonLookup,
  IPackageJson,
  Text,
  IPackageJsonScriptTable
 } from '@microsoft/node-core-library';

export class RushX {

  public static launchRushX(launcherVersion: string, isManaged: boolean): void {
    try {
      // Find the governing package.json for this folder:
      const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

      const packageJsonFilePath: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(process.cwd());
      if (!packageJsonFilePath) {
        console.log(colors.red('This command should be used inside a project folder.'));
        console.log(`Unable to find a package.json file in the current working directory or any of its parents.`);
        process.exitCode = 1;
        return;
      }

      const packageJson: IPackageJson = packageJsonLookup.loadPackageJson(packageJsonFilePath);

      // 0 = node.exe
      // 1 = rushx
      const args: string[] = process.argv.slice(2);

      if (args.length === 0 || args[0][0] === '-') {
        RushX._showUsage(packageJson);
        process.exitCode = 1;
        return;
      }

      const command: string = args[0];
      console.log('Execute: ' + command);

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
      for (const scriptName of Object.keys(scripts)) {
        maxLength = Math.max(maxLength, scriptName.length);
      }

      let warning: string | undefined = undefined;

      for (const scriptName of Object.keys(scripts)) {
        if (scriptName[0] === '-' || scriptName.length === 0) {
          if (!warning) {
            warning = scriptName;
          }
        } else {
          console.log('  '
          + colors.cyan(Text.padEnd(scriptName + ':', maxLength + 2))
          + JSON.stringify(scripts[scriptName]));
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
