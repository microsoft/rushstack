// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Configuration as WebpackDevServerConfiguration } from 'webpack-dev-server';
import type * as TWebpack from 'webpack';
import type { AsyncParallelHook, AsyncSeriesWaterfallHook } from 'tapable';

/**
 * @public
 */
export interface IWebpackConfigurationWithDevServer extends TWebpack.Configuration {
  devServer?: WebpackDevServerConfiguration;
}

/**
 * @public
 */
export type IWebpackConfiguration =
  | IWebpackConfigurationWithDevServer
  | IWebpackConfigurationWithDevServer[]
  | undefined;

/**
 * @public
 */
 export interface IWebpack5PluginAccessor {
  /**
   * A hook that allows for modification of the  configuration used by the Webpack
   * plugin. This must be populated for Webpack to run. If a webpack configuration is
   * provided, this will be populated automatically with the exports of the config
   * file.
   *
   * @remarks
   * Tapable event handlers can return `false` instead of `undefined` to suppress
   * other handlers from creating a configuration object.
   */
  readonly onConfigureWebpackHook: AsyncSeriesWaterfallHook<IWebpackConfiguration | false>;
  /**
   * A hook that provides the finalized configuration that will be used by Webpack.
   * If the configuration object is supressed, this hook will not be called.
   */
  readonly onAfterConfigureWebpackHook: AsyncParallelHook<IWebpackConfiguration>;
  /**
   * A hook that provides the stats output from Webpack. If the configuration object
   * is suppressed, this hook will not be called.
   */
  readonly onEmitStatsHook: AsyncParallelHook<TWebpack.Stats | TWebpack.MultiStats>;
}
