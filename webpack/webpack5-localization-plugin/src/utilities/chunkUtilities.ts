// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Chunk, ChunkGraph } from 'webpack';

export function chunkIsJs(chunk: Chunk, chunkGraph: ChunkGraph): boolean {
  return !!chunkGraph.getChunkModulesIterableBySourceType(chunk, 'javascript');
}
