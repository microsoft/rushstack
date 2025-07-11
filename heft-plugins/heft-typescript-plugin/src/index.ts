// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin for using TypeScript.
 *
 * @packageDocumentation
 */

export type {
  IPartialTsconfigCompilerOptions,
  IPartialTsconfig,
  IChangedFilesHookOptions,
  ITypeScriptPluginAccessor
} from './TypeScriptPlugin';
/**
 * @beta
 */
export type { TypeScriptBuildConfiguration } from './schemas/typescript.schema.json.d.ts';

export {
  PLUGIN_NAME as TypeScriptPluginName,
  loadTypeScriptConfigurationFileAsync,
  loadPartialTsconfigFileAsync
} from './TypeScriptPlugin';

export type { IBaseTypeScriptTool as _IBaseTypeScriptTool } from './TypeScriptBuilder';
export {
  loadTypeScriptToolAsync as _loadTypeScriptToolAsync,
  type ILoadedTypeScriptTool as _ILoadedTypeScriptTool,
  type ICompilerCapabilities as _ICompilerCapabilities,
  type ILoadTypeScriptToolOptions as _ILoadTypeScriptToolOptions
} from './loadTypeScriptTool';
export {
  loadTsconfig as _loadTsconfig,
  getTsconfigFilePath as _getTsconfigFilePath,
  type ILoadTsconfigOptions as _ILoadTsconfigOptions
} from './tsconfigLoader';
import type * as TTypeScript from 'typescript';
export { TTypeScript as _TTypeScript };
