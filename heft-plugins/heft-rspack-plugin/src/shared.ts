// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TRspack from '@rspack/core';
import type * as TRspackDevServer from '@rspack/dev-server';
import type {
  AsyncParallelHook,
  AsyncSeriesBailHook,
  AsyncSeriesHook,
  AsyncSeriesWaterfallHook
} from 'tapable';

import type { HeftConfiguration, IHeftTaskSession } from '@rushstack/heft';

export type RspackCoreImport = typeof import('@rspack/core');

/**
 * The environment passed into the Webpack configuration function. Loosely based
 * on the default Webpack environment options, specified here:
 * https://webpack.js.org/api/cli/#environment-options
 *
 * @beta
 */
export interface IRspackConfigurationFnEnvironment {
  /**
   * Whether or not the run is in production mode. Synonym of
   * IWebpackConfigurationFnEnvironment.production.
   */
  prod: boolean;
  /**
   * Whether or not the run is in production mode. Synonym of
   * {@link IRspackConfigurationFnEnvironment.prod}.
   */
  production: boolean;

  // Non-standard environment options
  /**
   * The task session provided to the plugin.
   */
  taskSession: IHeftTaskSession;
  /**
   * The Heft configuration provided to the plugin.
   */
  heftConfiguration: HeftConfiguration;
  /**
   * The resolved Rspack package.
   */
  rspack: RspackCoreImport;
}

/**
 * @beta
 */
export interface IRspackConfigurationWithDevServer extends TRspack.Configuration {
  devServer?: TRspackDevServer.Configuration;
};

/**
 * @beta
 */
export type IRspackConfiguration = TRspack.Configuration | TRspack.Configuration[];

/**
 * @beta
 */
export interface IRspackPluginAccessorHooks {
  /**
   * A hook that allows for loading custom configurations used by the Rspack
   * plugin. If a tap returns a value other than `undefined` before stage {@link STAGE_LOAD_LOCAL_CONFIG},
   * it will suppress loading from the Rspack config file. To provide a fallback behavior in the
   * absence of a local config file, tap this hook with a `stage` value greater than {@link STAGE_LOAD_LOCAL_CONFIG}.
   *
   * @remarks
   * Tapable event handlers can return `false` instead of `undefined` to suppress
   * other handlers from creating a configuration object, and prevent Rspack from running.
   */
  readonly onLoadConfiguration: AsyncSeriesBailHook<never, never, never, IRspackConfiguration | false>;
  /**
   * A hook that allows for modification of the loaded configuration used by the Rspack
   * plugin. If no configuration was loaded, this hook will not be called.
   */
  readonly onConfigure: AsyncSeriesHook<IRspackConfiguration, never, never>;
  /**
   * A hook that provides the finalized configuration that will be used by Rspack.
   * If no configuration was loaded, this hook will not be called.
   */
  readonly onAfterConfigure: AsyncParallelHook<IRspackConfiguration, never, never>;
  /**
   * A hook that provides the stats output from Rspack. If no configuration is loaded,
   * this hook will not be called.
   */
  readonly onEmitStats: AsyncParallelHook<TRspack.Stats | TRspack.MultiStats, never, never>;
  /**
   * A hook that allows for customization of the file watcher options. If not running in watch mode, this hook will not be called.
   */
  readonly onGetWatchOptions: AsyncSeriesWaterfallHook<
    Parameters<TRspack.Compiler['watch']>[0],
    Readonly<IRspackConfiguration>,
    never
  >;
}

/**
 * @beta
 */
export interface IRspackPluginAccessorParameters {
  /**
   * Whether or not serve mode was enabled by passing the `--serve` flag.
   */
  readonly isServeMode: boolean;
}

/**
 * @beta
 */
export interface IRspackPluginAccessor {
  /**
   * Hooks that are called at various points in the Webpack plugin lifecycle.
   */
  readonly hooks: IRspackPluginAccessorHooks;
  /**
   * Parameters that are provided by the Webpack plugin.
   */
  readonly parameters: IRspackPluginAccessorParameters;
}

/**
 * The stage in the `onLoadConfiguration` hook at which the config will be loaded from the local
 * webpack config file.
 * @beta
 */
export const STAGE_LOAD_LOCAL_CONFIG: 1000 = 1000;

/**
 * @beta
 */
export const PLUGIN_NAME: 'rspack-plugin' = 'rspack-plugin';
