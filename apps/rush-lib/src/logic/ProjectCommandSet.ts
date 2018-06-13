// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IPackageJson,
  IPackageJsonScriptTable
 } from '@microsoft/node-core-library';

/**
 * Parses the "scripts" section from package.json and provides support for executing scripts.
 */
export class ProjectCommandSet {
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
