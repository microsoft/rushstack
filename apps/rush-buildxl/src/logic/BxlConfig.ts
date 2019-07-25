// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';

import { BxlModule } from './BxlModule';

export class BxlConfig {
  private _bxlRoot: string;
  private _modulesFolder: string;
  private _modules: BxlModule[];
  private _commonRushConfigFolder: string;

  constructor(bxlRoot: string, modulesFolder: string, modules: BxlModule[], commonRushConfigFolder: string) {
    this._bxlRoot = bxlRoot;
    this._modulesFolder = modulesFolder;
    this._modules = modules;
    this._commonRushConfigFolder = commonRushConfigFolder;
  }

  public get bxlConfigFilePath(): string {
    return `${this._modulesFolder}/config.dsc`;
  }

  public async writeFile(): Promise<void> {
    const contents: string =
`config({
    modules: [
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
            name: a\`CommonRushConfig\`,
            path: p\`${this._commonRushConfigFolder}\`,
            trackSourceFileChanges: true,
            isWritable: false,
            isReadable: true
        },
        {
          name: a\`Out\`,
          path: p\`../out\`,
          trackSourceFileChanges: true,
          isWritable: true,
          isReadable: true
        },
  ]
});`;

    FileSystem.writeFile(this.bxlConfigFilePath, contents, { ensureFolderExists: true });
  }
}
