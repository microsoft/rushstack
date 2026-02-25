// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

/**
 * This library wraps terser in convenient handles for parallelization.
 * It powers `@rushstack/webpack4-module-minifier-plugin` and `@rushstack/webpack5-module-minifier-plugin`
 * but has no coupling with webpack.
 *
 * @packageDocumentation
 */

export type { MinifyOptions } from 'terser';

export type { ILocalMinifierOptions } from './LocalMinifier.ts';
export { LocalMinifier } from './LocalMinifier.ts';

export { MessagePortMinifier } from './MessagePortMinifier.ts';

export { getIdentifier } from './MinifiedIdentifier.ts';

export { minifySingleFileAsync as _minifySingleFileAsync } from './MinifySingleFile.ts';

export { NoopMinifier } from './NoopMinifier.ts';

export type {
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationErrorResult,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  IModuleMinificationSuccessResult,
  IModuleMinifier,
  IModuleMinifierFunction
} from './types.ts';

export type { IWorkerPoolMinifierOptions } from './WorkerPoolMinifier.ts';
export { WorkerPoolMinifier } from './WorkerPoolMinifier.ts';
