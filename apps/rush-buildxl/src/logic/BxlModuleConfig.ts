// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileSystem } from '@microsoft/node-core-library';

export class BxlModuleConfig {
  private _name: string;
  private _moduleFilePath: string;
  private _moduleFolder: string;

  public constructor(name: string, moduleFolder: string, moduleFilePath: string) {
    this._name = name;
    this._moduleFolder = moduleFolder;
    this._moduleFilePath = moduleFilePath;
  }

  public get moduleConfigFilePath(): string {
    return path.resolve(this._moduleFolder, 'module.config.dsc');
  }

  public async writeFile(): Promise<void> {
    const contents: string =
`package({
  name: "${this._name}",
  nameResolutionSemantics: NameResolutionSemantics.implicitProjectReferences,
  projects: [
    f\`${this._moduleFilePath}\`
  ]
});`;

    FileSystem.writeFile(this.moduleConfigFilePath, contents, { ensureFolderExists: true });
  }
}