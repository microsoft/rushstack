// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * HeftRspackPlugin is a Heft plugin that integrates the Rspack bundler into the Heft build process.
 *
 * @packageDocumentation
 */

export { PLUGIN_NAME as PluginName, STAGE_LOAD_LOCAL_CONFIG } from './shared.ts';

export type {
  IRspackConfigurationWithDevServer,
  IRspackConfiguration,
  IRspackConfigurationFnEnvironment,
  IRspackPluginAccessor,
  IRspackPluginAccessorHooks,
  IRspackPluginAccessorParameters,
  RspackCoreImport
} from './shared.ts';
