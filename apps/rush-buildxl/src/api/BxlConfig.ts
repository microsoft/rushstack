// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';
import { BxlModule } from './BxlModule';

export class BxlConfig {
  private _bxlRoot: string;
  private _moduleDir: string;
  private _modules: BxlModule[];

  constructor(bxlRoot: string, moduleDir: string, modules: BxlModule[]) {
    this._bxlRoot = bxlRoot;
    this._moduleDir = moduleDir;
    this._modules = modules;
  }

  public get filePath(): string {
    return `${this._moduleDir}/config.dsc`;
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

    FileSystem.ensureFolder(this._moduleDir);
    FileSystem.writeFile(this.filePath, contents);
    return Promise.resolve();
  }
}
