// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';

export class BxlModuleConfig {
  private _name: string;
  private _project: string;
  private _moduleDir: string;

  constructor(name: string, moduleDir: string, moduleFilePath: string) {
    this._name = name;
    this._moduleDir = moduleDir;
    this._project = moduleFilePath;
  }

  public get moduleConfigFilePath(): string {
    return this._moduleDir + '/module.config.dsc';
  }

  public writeFile(): Promise<void> {
    const contents: string =
`package({
    name: "${this._name}",
    nameResolutionSemantics: NameResolutionSemantics.implicitProjectReferences,
    projects: [
        f\`${this._project}\`
    ]
});`;

    FileSystem.ensureFolder(this._moduleDir);
    FileSystem.writeFile(this.moduleConfigFilePath, contents);

    return Promise.resolve();
  }
}