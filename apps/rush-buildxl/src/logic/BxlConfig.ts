// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';

import { BxlModule } from './BxlModule';

export class BxlConfig {
  private _bxlRoot: string;
  private _modulesFolder: string;
  private _modules: string;
  private _commonRushConfigFolder: string;
  private _repoRoot: string;

  constructor(
      bxlRoot: string,
      modulesFolder: string,
      modules: BxlModule[],
      commonRushConfigFolder: string,
      repoRoot: string) {

    this._bxlRoot = bxlRoot;
    this._modulesFolder = modulesFolder;
    this._modules = modules.map((m) => `f\`${m.configFilePath}\`,`).join('\n    ');
    this._commonRushConfigFolder = commonRushConfigFolder;
    this._repoRoot = repoRoot;
  }

  public get bxlConfigFilePath(): string {
    return `${this._modulesFolder}/config.dsc`;
  }

  public async writeFile(): Promise<void> {
    const contents: string =
`config({
  modules: [
    ${this._modules}
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
      name: a\`Root\`,
      path: p\`${this._repoRoot}\`,
      trackSourceFileChanges: true,
      isWritable: true,
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
