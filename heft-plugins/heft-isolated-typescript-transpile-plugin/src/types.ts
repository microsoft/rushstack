// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ModuleKind, ScriptTarget } from './SwcIsolatedTranspilePlugin';

export interface IProjectOptions {
  buildFolder: string;
}

export interface IEmitKind {
  outDir: string;
  formatOverride: ModuleKind;
  targetOverride: ScriptTarget;
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
  optionsIndex: number;
  jsFilePath: string;
  mapFilePath: string | undefined;
}

export interface ITransformModulesRequestMessage {
  options: string[];
  tasks: ITransformTask[];
}
