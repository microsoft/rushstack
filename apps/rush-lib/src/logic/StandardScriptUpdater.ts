// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import { Text } from '@microsoft/node-core-library';

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
      if (StandardScriptUpdater._updateScript(scriptName, rushConfiguration, false)) {
        anyChanges = true;
      }
    }

    if (anyChanges) {
      console.log();
    }
    return anyChanges;
  }

  /**
   * Throw an exceptions if the scripts are out of date.
   * Used by "rush install".
   */
  public static validate(rushConfiguration: RushConfiguration): void {
    for (const scriptName of StandardScriptUpdater._scriptNames) {
      StandardScriptUpdater._updateScript(scriptName, rushConfiguration, true);
    }
  }

  private static _updateScript(scriptName: string, rushConfiguration: RushConfiguration,
    validateOnly: boolean): boolean {
    const targetFilePath: string = path.join(rushConfiguration.commonScriptsFolder, scriptName);
    const sourceFilePath: string = path.resolve(__dirname, '../../lib/scripts', scriptName);

    fsx.mkdirsSync(rushConfiguration.commonScriptsFolder);

    // Are the files the same?
    let filesAreSame: boolean = false;

    if (fsx.existsSync(targetFilePath)) {
      const sourceContent: string = fsx.readFileSync(sourceFilePath).toString();
      const targetContent: string = fsx.readFileSync(targetFilePath).toString();

      const sourceNormalized: string = StandardScriptUpdater._normalize(sourceContent);
      const targetNormalized: string = StandardScriptUpdater._normalize(targetContent);

      if (sourceNormalized === targetNormalized) {
        filesAreSame = true;
      }
    }

    if (!filesAreSame) {
      if (validateOnly) {
        throw new Error('The standard files in the "common/scripts" folders are need to be updated'
          + ' for this Rush version.  Please run "rush update" and commit the changes.');
      } else {
        console.log(`Script is out of date; updating "${targetFilePath}"`);
        fsx.copyFileSync(sourceFilePath, targetFilePath);
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
