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

export type { ILocalMinifierOptions } from './LocalMinifier';
export { LocalMinifier } from './LocalMinifier';

export { MessagePortMinifier } from './MessagePortMinifier';

export { getIdentifier } from './MinifiedIdentifier';

export { minifySingleFileAsync as _minifySingleFileAsync } from './MinifySingleFile';

export { NoopMinifier } from './NoopMinifier';

export type {
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationErrorResult,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  IModuleMinificationSuccessResult,
  IModuleMinifier,
  IModuleMinifierFunction
} from './types';

export type { IWorkerPoolMinifierOptions } from './WorkerPoolMinifier';
export { WorkerPoolMinifier } from './WorkerPoolMinifier';
