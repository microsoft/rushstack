// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Compiler, WebpackPluginInstance } from 'webpack';
import type { Volume } from 'memfs/lib/volume';

const PLUGIN_NAME: 'MemFSPlugin' = 'MemFSPlugin';
export class MemFSPlugin implements WebpackPluginInstance {
  private readonly _memfs: Volume;

  public constructor(memfs: Volume) {
    this._memfs = memfs;
  }

  public apply(compiler: Compiler): void {
    const nodeFileSystem: typeof compiler.inputFileSystem = compiler.inputFileSystem;
    compiler.inputFileSystem = this._memfs;
    compiler.intermediateFileSystem = this._memfs;
    compiler.outputFileSystem = this._memfs;
    compiler.resolverFactory.hooks.resolveOptions.for('loader').tap(
      {
        stage: 10,
        name: PLUGIN_NAME
      },
      (options) => {
        options.fileSystem = nodeFileSystem;
        return options;
      }
    );
  }
}
