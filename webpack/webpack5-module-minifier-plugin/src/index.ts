// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export {
  MODULE_WRAPPER_PREFIX,
  MODULE_WRAPPER_SUFFIX,
  MODULE_WRAPPER_SHORTHAND_PREFIX,
  MODULE_WRAPPER_SHORTHAND_SUFFIX,
  CHUNK_MODULE_TOKEN,
  CHUNK_MODULE_REGEX,
  STAGE_BEFORE,
  STAGE_AFTER
} from './Constants';
export { generateLicenseFileForAsset } from './GenerateLicenseFileForAsset';
export type {
  IAssetInfo,
  IAssetMap,
  IAssetStats,
  IDehydratedAssets,
  IFactoryMeta,
  IModuleInfo,
  IModuleMap,
  IModuleMinifierPluginHooks,
  IModuleMinifierPluginOptions,
  IModuleMinifierPluginStats,
  IModuleStats,
  IPostProcessFragmentContext,
  IRenderedModulePosition
} from './ModuleMinifierPlugin.types';
export { ModuleMinifierPlugin } from './ModuleMinifierPlugin';
