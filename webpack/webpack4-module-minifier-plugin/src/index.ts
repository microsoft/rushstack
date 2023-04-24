// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export * from './Constants';
export * from './GenerateLicenseFileForAsset';
export * from './ModuleMinifierPlugin.types';
export * from './ModuleMinifierPlugin';
export * from './PortableMinifierIdsPlugin';
export * from './RehydrateAsset';
export type {
  ILocalMinifierOptions,
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationErrorResult,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  IModuleMinificationSuccessResult,
  IModuleMinifier,
  IModuleMinifierFunction,
  IWorkerPoolMinifierOptions
} from '@rushstack/module-minifier';
export {
  getIdentifier,
  LocalMinifier,
  MessagePortMinifier,
  NoopMinifier,
  WorkerPoolMinifier
} from '@rushstack/module-minifier';
