// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TNapiRsCli from '@napi-rs/cli';
import { IHeftTaskSession, HeftConfiguration } from '@rushstack/heft';
import type { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook } from 'tapable';

/**
 * @beta
 */
export const PLUGIN_NAME: 'heft-napi-rs-plugin' = 'heft-napi-rs-plugin';

export type NapiRsCliImport = typeof import('@napi-rs/cli');

export type NapiCli = TNapiRsCli.NapiCli;

/**
 * @beta
 */
export type NapiCliBuildOptions = Parameters<NapiCli['build']>[0];

/**
 * @beta
 */
export interface INapiRsConfiguration {
  build: NapiCliBuildOptions;
}

/**
 * The environment passed into the NAPI-RS configuration function. Loosely based
 * on the default NAPI-RS environment options, specified here:
 *
 * @beta
 */
export interface INapiRsConfigurationFnOptions {
  /**
   * The task session provided to the plugin.
   */
  taskSession: IHeftTaskSession;
  /**
   * The Heft configuration provided to the plugin.
   */
  heftConfiguration: HeftConfiguration;
  /**
   * The resolved NAPI-RS package.
   */
  napiRs: NapiRsCliImport;
}

/**
 * @beta
 */
export interface INapiRsPluginAccessorHooks {
  /**
   * A hook that allows for loading custom configurations used by the NAPI-RS
   * plugin. If a tap returns a value other than `undefined` before stage {@link STAGE_LOAD_LOCAL_CONFIG},
   * it will suppress loading from the NAPI-RS config file. To provide a fallback behavior in the
   * absence of a local config file, tap this hook with a `stage` value greater than {@link STAGE_LOAD_LOCAL_CONFIG}.
   *
   * @remarks
   * Tapable event handlers can return `false` instead of `undefined` to suppress
   * other handlers from creating a configuration object, and prevent NAPI-RS from running.
   */
  readonly onLoadConfiguration: AsyncSeriesBailHook<[], INapiRsConfiguration | undefined | false>;
  /**
   * A hook that allows for modification of the loaded configuration used by the NAPI-RS
   * plugin. If no configuration was loaded, this hook will not be called.
   */
  readonly onConfigure: AsyncSeriesHook<[INapiRsConfiguration], never>;
  /**
   * A hook that provides the finalized configuration that will be used by NAPI-RS.
   * If no configuration was loaded, this hook will not be called.
   */
  readonly onAfterConfigure: AsyncParallelHook<[INapiRsConfiguration], never>;
}

/**
 * @beta
 */
export interface INapiRsPluginAccessorParameters {}

/**
 * @beta
 */
export interface INapiRsPluginAccessor {
  /**
   * Hooks that are called at various points in the NAPI-RS plugin lifecycle.
   */
  readonly hooks: INapiRsPluginAccessorHooks;
  /**
   * Parameters that are provided by the NAPI-RS plugin.
   */
  readonly parameters: INapiRsPluginAccessorParameters;
}

/**
 * The stage in the `onLoadConfiguration` hook at which the config will be loaded from the local
 * NAPI-RS config file.
 * @beta
 */
export const STAGE_LOAD_LOCAL_CONFIG: 1000 = 1000;
