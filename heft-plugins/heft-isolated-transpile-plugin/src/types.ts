// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { _TTypeScript as TTypeScript } from '@rushstack/heft-typescript-plugin';

export interface IProjectOptions {
  buildFolder: string;
}

export interface IEmitKind {
  outDir: string;
  formatOverride: keyof typeof TTypeScript.ModuleKind;
  targetOverride: keyof typeof TTypeScript.ScriptTarget;
}

export interface ISwcIsolatedTranspileOptions {
  tsConfigPath?: string;
  emitKinds?: IEmitKind[];
}

export interface IWorkerData {
  buildFolderPath: string;
  concurrency: number;
}

export interface IWorkerResult {
  errors: [string, string][];
  timings: [string, number][];
  durationMs: number;
}

export interface ITransformTask {
  srcFilePath: string;
  relativeSrcFilePath: string;
  options: Buffer;
  jsFilePath: string;
  mapFilePath: string | undefined;
}
