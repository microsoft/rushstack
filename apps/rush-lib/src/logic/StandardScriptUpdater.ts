// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Text, FileSystem } from '@microsoft/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';

/**
 * Checks whether the common/scripts files are up to date, and recopies them if needed.
 * This is used by the "rush install" and "rush update" commands.
 */
export class StandardScriptUpdater {
  private static readonly _scriptNames: string[] = [ 'install-run.js', 'install-run-rush.js' ];

  /**
   * Recopy the scripts if the scripts are out of date.
   * Used by "rush update".
   */
  public static update(rushConfiguration: RushConfiguration): boolean {
    let anyChanges: boolean = false;
    for (const scriptName of StandardScriptUpdater._scriptNames) {
      if (StandardScriptUpdater._updateScriptOrThrow(scriptName, rushConfiguration, false)) {
        anyChanges = true;
      }
    }

    if (anyChanges) {
      console.log(); // print a newline after the notices
    }
    return anyChanges;
  }

  /**
   * Throw an exception if the scripts are out of date.
   * Used by "rush install".
   */
  public static validate(rushConfiguration: RushConfiguration): void {
    for (const scriptName of StandardScriptUpdater._scriptNames) {
      StandardScriptUpdater._updateScriptOrThrow(scriptName, rushConfiguration, true);
    }
  }

  /**
   * Compares a single script in the common/script folder to see if it needs to be updated.
   * If throwInsteadOfCopy=false, then an outdated or missing script will be recopied;
   * otherwise, an exception is thrown.
   */
  private static _updateScriptOrThrow(scriptName: string, rushConfiguration: RushConfiguration,
    throwInsteadOfCopy: boolean): boolean {
    const targetFilePath: string = path.join(rushConfiguration.commonScriptsFolder, scriptName);
    const sourceFilePath: string = path.resolve(__dirname, '../scripts', scriptName);

    FileSystem.ensureFolder(rushConfiguration.commonScriptsFolder);

    // Are the files the same?
    let filesAreSame: boolean = false;

    if (FileSystem.exists(targetFilePath)) {
      const sourceContent: string = FileSystem.readFile(sourceFilePath);
      const targetContent: string = FileSystem.readFile(targetFilePath);

      const sourceNormalized: string = StandardScriptUpdater._normalize(sourceContent);
      const targetNormalized: string = StandardScriptUpdater._normalize(targetContent);

      if (sourceNormalized === targetNormalized) {
        filesAreSame = true;
      }
    }

    if (!filesAreSame) {
      if (throwInsteadOfCopy) {
        throw new Error('The standard files in the "common/scripts" folders need to be updated'
          + ' for this Rush version.  Please run "rush update" and commit the changes.');
      } else {
        console.log(`Script is out of date; updating "${targetFilePath}"`);
        FileSystem.copyFile({
          sourcePath: sourceFilePath,
          destinationPath: targetFilePath
        });
      }
    }

    return !filesAreSame;
  }

  private static _normalize(content: string): string {
    // Ignore newline differences from .gitattributes
    return Text.convertToLf(content)
      // Ignore trailing whitespace
      .split('\n').map(x => x.trimRight()).join('\n');
  }
}
