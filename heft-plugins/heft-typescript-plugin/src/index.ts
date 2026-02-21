// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin for using TypeScript.
 *
 * @packageDocumentation
 */

export type {
  IEmitModuleKind,
  IStaticAssetsCopyConfiguration,
  ITypeScriptConfigurationJson,
  IPartialTsconfigCompilerOptions,
  IPartialTsconfig,
  IChangedFilesHookOptions,
  ITypeScriptPluginAccessor
} from './TypeScriptPlugin.ts';

export {
  PLUGIN_NAME as TypeScriptPluginName,
  loadTypeScriptConfigurationFileAsync,
  loadPartialTsconfigFileAsync
} from './TypeScriptPlugin.ts';

export type { IBaseTypeScriptTool as _IBaseTypeScriptTool } from './TypeScriptBuilder.ts';
export {
  loadTypeScriptToolAsync as _loadTypeScriptToolAsync,
  type ILoadedTypeScriptTool as _ILoadedTypeScriptTool,
  type ICompilerCapabilities as _ICompilerCapabilities,
  type ILoadTypeScriptToolOptions as _ILoadTypeScriptToolOptions
} from './loadTypeScriptTool.ts';
export {
  loadTsconfig as _loadTsconfig,
  getTsconfigFilePath as _getTsconfigFilePath,
  type ILoadTsconfigOptions as _ILoadTsconfigOptions
} from './tsconfigLoader.ts';
import type * as TTypeScript from 'typescript';
export { TTypeScript as _TTypeScript };
