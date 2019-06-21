// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IV3Asset {
}

export interface IV3Chunk {
  chunks: IV3Chunk[];
  name: string;
  renderedHash: string;
  forEachModule(iterator: (module: IV3Module) => void): void;
}

export interface IV3Module {
  assets: IV3Asset[];
}

export interface IV3MainTemplate {
  requireFn: string;
  plugin(hook: 'startup', callback: (source: string, chunk: IV3Chunk, hash: string) => void): void;
}

export interface IV3Compilation {
  mainTemplate: IV3MainTemplate;
}