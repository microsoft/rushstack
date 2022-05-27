// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Heft plugin for using TypeScript.
 *
 * @packageDocumentation
 */

export type {
  IExtendedTypeScript,
  IExtendedProgram,
  IExtendedSourceFile
} from './internalTypings/TypeScriptInternals';

export type {
  ITypeScriptConfigurationJson,
  IStaticAssetsCopyConfiguration,
  IEmitModuleKind,
  IChangedFilesHookOptions,
  ITypeScriptPluginAccessor
} from './TypeScriptPlugin';
