// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Compiler, InputFileSystem, OutputFileSystem, WebpackPluginInstance } from 'webpack';
import type { Volume } from 'memfs/lib/volume';

type IntermediateFileSystem = Compiler['intermediateFileSystem'];

const PLUGIN_NAME: 'MemFSPlugin' = 'MemFSPlugin';
export class MemFSPlugin implements WebpackPluginInstance {
  private readonly _memfs: Volume;

  public constructor(memfs: Volume) {
    this._memfs = memfs;
  }

  public apply(compiler: Compiler): void {
    const nodeFileSystem: InputFileSystem | null = compiler.inputFileSystem;
    if (!nodeFileSystem) {
      throw new Error('MemFSPlugin requires compiler.inputFileSystem to be defined');
    }
    compiler.inputFileSystem = this._memfs as unknown as InputFileSystem;
    compiler.intermediateFileSystem = this._memfs as unknown as IntermediateFileSystem;
    compiler.outputFileSystem = this._memfs as unknown as OutputFileSystem;
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
