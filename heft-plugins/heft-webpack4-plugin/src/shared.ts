// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line import/order
import type * as TWebpack from 'webpack';
// Compensate for webpack-dev-server referencing constructs from webpack 5
declare module 'webpack' {
  export type MultiStats = TWebpack.compilation.MultiStats;
  export type StatsOptions = unknown;
  export type StatsCompilation = TWebpack.compilation.Compilation;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface Compiler {
    watching?: unknown;
  }
}
import type { Configuration as WebpackDevServerConfiguration } from 'webpack-dev-server';
import type { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook } from 'tapable';

import type { IHeftTaskSession, HeftConfiguration } from '@rushstack/heft';

/**
 * The environment passed into the Webpack configuration function. Loosely based
 * on the default Webpack environment options, specified here:
 * https://webpack.js.org/api/cli/#environment-options
 *
 * @public
 */
export interface IWebpackConfigurationFnEnvironment {
  /**
   * Whether or not the run is in production mode. Synonym of
   * IWebpackConfigurationFnEnvironment.production.
   */
  prod: boolean;
  /**
   * Whether or not the run is in production mode. Synonym of
   * IWebpackConfigurationFnEnvironment.prod.
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
   * The resolved Webpack package.
   */
  webpack: typeof TWebpack;
}

/**
 * @public
 */
export interface IWebpackConfigurationWithDevServer extends TWebpack.Configuration {
  devServer?: WebpackDevServerConfiguration;
}

/**
 * @public
 */
export type IWebpackConfiguration = IWebpackConfigurationWithDevServer | IWebpackConfigurationWithDevServer[];

/**
 * @public
 */
export interface IWebpackPluginAccessorHooks {
  /**
   * A hook that allows for loading custom configurations used by the Webpack
   * plugin. If a tap returns a value other than `undefined` before stage {@link STAGE_LOAD_LOCAL_CONFIG},
   * it will suppress loading from the webpack config file. To provide a fallback behavior in the
   * absence of a local config file, tap this hook with a `stage` value greater than {@link STAGE_LOAD_LOCAL_CONFIG}.
   *
   * @remarks
   * Tapable event handlers can return `false` instead of `undefined` to suppress
   * other handlers from creating a configuration object, and prevent webpack from running.
   */
  readonly onLoadConfiguration: AsyncSeriesBailHook<never, never, never, IWebpackConfiguration | false>;
  /**
   * A hook that allows for modification of the loaded configuration used by the Webpack
   * plugin. If no configuration was loaded, this hook will not be called.
   */
  readonly onConfigure: AsyncSeriesHook<IWebpackConfiguration, never, never>;
  /**
   * A hook that provides the finalized configuration that will be used by Webpack.
   * If no configuration was loaded, this hook will not be called.
   */
  readonly onAfterConfigure: AsyncParallelHook<IWebpackConfiguration, never, never>;
  /**
   * A hook that provides the stats output from Webpack. If no configuration is loaded,
   * this hook will not be called.
   */
  readonly onEmitStats: AsyncParallelHook<TWebpack.Stats | TWebpack.compilation.MultiStats, never, never>;
}

/**
 * @public
 */
export interface IWebpackPluginAccessorParameters {
  /**
   * Whether or not serve mode was enabled by passing the `--serve` flag.
   */
  readonly isServeMode: boolean;
}

/**
 * @public
 */
export interface IWebpackPluginAccessor {
  /**
   * Hooks that are called at various points in the Webpack plugin lifecycle.
   */
  readonly hooks: IWebpackPluginAccessorHooks;
  /**
   * Parameters that are provided by the Webpack plugin.
   */
  readonly parameters: IWebpackPluginAccessorParameters;
}

/**
 * The stage in the `onLoadConfiguration` hook at which the config will be loaded from the local
 * webpack config file.
 * @public
 */
export const STAGE_LOAD_LOCAL_CONFIG: 1000 = 1000;

/**
 * @public
 */
export const PLUGIN_NAME: 'webpack4-plugin' = 'webpack4-plugin';
