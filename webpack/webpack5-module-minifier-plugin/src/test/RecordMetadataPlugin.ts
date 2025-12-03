// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Compilation, Compiler, WebpackPluginInstance } from 'webpack';

import type { IModuleStats, IModuleMinifierPluginStats, IAssetStats } from '../ModuleMinifierPlugin.types';
import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';

export type IFlattenedModuleMetadata = Map<string | number, number | 'inline'>;
export type IFlattenedCompilationModuleMetadata = Map<string | number, IFlattenedModuleMetadata>;

export interface IFlattenedCompilationMetadata {
  byModule: IFlattenedCompilationModuleMetadata;
  byAssetFilename: Map<string, IAssetStats>;
}

export class RecordMetadataPlugin implements WebpackPluginInstance {
  public readonly metadata: IFlattenedCompilationMetadata = {
    byModule: new Map(),
    byAssetFilename: new Map()
  };

  public apply(compiler: Compiler): void {
    compiler.hooks.afterEmit.tap('RecordMetadataPlugin', (compilation: Compilation) => {
      const { chunkGraph } = compilation;

      const { metadata } = this;
      metadata.byModule.clear();

      const compilationMetadata: IModuleMinifierPluginStats | undefined =
        ModuleMinifierPlugin.getCompilationStatistics(compilation);
      if (!compilationMetadata) {
        throw new Error(`Unable to get ModuleMinfierPlugin statistics`);
      }

      const { metadataByModule, metadataByAssetFileName } = compilationMetadata;
      metadata.byAssetFilename = metadataByAssetFileName;

      for (const module of compilation.modules) {
        const id: string | number | null = chunkGraph.getModuleId(module);
        const metadataForModule: IModuleStats | undefined = metadataByModule.get(module);
        if (metadataForModule && id !== null) {
          const flattenedModule: IFlattenedModuleMetadata = new Map();
          for (const [chunk, hash] of metadataForModule.hashByChunk) {
            const chunkId: string | number | null = chunk.id;
            if (!chunkId) {
              throw new Error(`Missing a chunk id`);
            }
            const size: number | undefined = metadataForModule.sizeByHash.get(hash);

            flattenedModule.set(chunkId, typeof size === 'number' ? size : 'inline');
          }
          metadata.byModule.set(id, flattenedModule);
        }
      }
    });
  }
}
