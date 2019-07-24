// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';

import { BxlModule } from './BxlModule';

export class BxlConfig {
  private _bxlRoot: string;
  private _modulesFolder: string;
  private _modules: BxlModule[];

  constructor(bxlRoot: string, modulesFolder: string, modules: BxlModule[]) {
    this._bxlRoot = bxlRoot;
    this._modulesFolder = modulesFolder;
    this._modules = modules;
  }

  public get bxlConfigFilePath(): string {
    return `${this._modulesFolder}/config.dsc`;
  }

  public writeFile(): Promise<void> {
    const contents: string =
`config({
    packages: [
        f\`${this._modules[0].configFilePath}\`,
    ],
    resolvers: [
        {
            kind: "SourceResolver",
            packages: [
                f\`${this._bxlRoot}/sdk/sdk.transformers/package.config.dsc\`,
                f\`${this._bxlRoot}/sdk/sdk.prelude/package.config.dsc\`,
            ]
        }
    ],
    mounts: [
        {
            name: a\`Out\`,
            path: p\`Out\\Bin\`,
            trackSourceFileChanges: true,
            isWritable: true,
            isReadable: true
        },
    ]
});`;

    FileSystem.writeFile(this.bxlConfigFilePath, contents, { ensureFolderExists: true });
    return Promise.resolve();
  }
}
