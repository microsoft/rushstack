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
export interface IWebpackVersions {
  webpackVersion: string;
  webpackDevServerVersion: string;
}

/**
 * @public
 */
export interface IWebpackPluginAccessor {
  /**
   * A hook that provides the versions of Webpack and Webpack Dev Server.
   */
  readonly onEmitWebpackVersionsHook?: AsyncParallelHook<IWebpackVersions>;
  /**
   * A hook that allows for modification of the  configuration used by the Webpack
   * plugin. This must be populated for Webpack to run. If webpackConfigFilePath is
   * specified, this will be populated automatically with the exports of the config
   * file referenced in that property.
   *
   * @remarks
   * Tapable event handlers can return `null` instead of `undefined` to suppress
   * other handlers from creating a configuration object.
   */
  // We are inheriting this problem from Tapable's API
  // eslint-disable-next-line @rushstack/no-new-null
  readonly onConfigureWebpackHook?: AsyncSeriesWaterfallHook<IWebpackConfiguration | null>;
  /**
   * A hook that provides the finalized configuration that will be used by Webpack.
   */
  // We are inheriting this problem from Tapable's API
  // eslint-disable-next-line @rushstack/no-new-null
  readonly onAfterConfigureWebpackHook?: AsyncParallelHook<IWebpackConfiguration | null>;
  /**
   * A hook that provides the stats output from Webpack.
   */
  readonly onEmitStatsHook?: AsyncParallelHook<TWebpack.Stats | TWebpack.compilation.MultiStats>;
}
