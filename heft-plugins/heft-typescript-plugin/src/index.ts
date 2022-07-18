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
} from './TypeScriptPlugin';

export {
  PLUGIN_NAME as TypeScriptPluginName,
  loadTypeScriptConfigurationFileAsync,
  loadPartialTsconfigFileAsync
} from './TypeScriptPlugin';
