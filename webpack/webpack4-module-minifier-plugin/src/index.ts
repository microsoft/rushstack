// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export {
  MODULE_WRAPPER_PREFIX,
  MODULE_WRAPPER_SUFFIX,
  CHUNK_MODULES_TOKEN,
  STAGE_BEFORE,
  STAGE_AFTER
} from './Constants.ts';
export { generateLicenseFileForAsset } from './GenerateLicenseFileForAsset.ts';
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
} from './ModuleMinifierPlugin.types.ts';
export { ModuleMinifierPlugin } from './ModuleMinifierPlugin.ts';
export { PortableMinifierModuleIdsPlugin } from './PortableMinifierIdsPlugin.ts';
export { rehydrateAsset } from './RehydrateAsset.ts';
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
