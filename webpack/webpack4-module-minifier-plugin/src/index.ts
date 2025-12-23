// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export {
  MODULE_WRAPPER_PREFIX,
  MODULE_WRAPPER_SUFFIX,
  CHUNK_MODULES_TOKEN,
  STAGE_BEFORE,
  STAGE_AFTER
} from './Constants';
export { generateLicenseFileForAsset } from './GenerateLicenseFileForAsset';
export type {
  IRenderedModulePosition,
  IAssetInfo,
  IModuleMinifierPluginStats,
  IAssetStats,
  IModuleInfo,
  IExtendedModule,
  _IWebpackCompilationData,
  _INormalModuleFactoryModuleData,
  IAssetMap,
  IModuleMap,
  IModuleMinifierPluginOptions,
  IDehydratedAssets,
  IPostProcessFragmentContext,
  IModuleMinifierPluginHooks,
  _IAcornComment
} from './ModuleMinifierPlugin.types';
export { ModuleMinifierPlugin } from './ModuleMinifierPlugin';
export { PortableMinifierModuleIdsPlugin } from './PortableMinifierIdsPlugin';
export { rehydrateAsset } from './RehydrateAsset';
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
