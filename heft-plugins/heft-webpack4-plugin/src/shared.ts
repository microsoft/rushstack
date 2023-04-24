// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as webpack from 'webpack';
// Compensate for webpack-dev-server referencing constructs from webpack 5
declare module 'webpack' {
  export type MultiStats = webpack.compilation.MultiStats;
  export type StatsOptions = unknown;
  export type StatsCompilation = webpack.compilation.Compilation;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  export interface Compiler {
    watching?: unknown;
  }
}
import type { Configuration as WebpackDevServerConfiguration } from 'webpack-dev-server';
import type { IBuildStageProperties, IBundleSubstageProperties } from '@rushstack/heft';

/**
 * @public
 */
export interface IWebpackConfigurationWithDevServer extends webpack.Configuration {
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
export interface IWebpackBundleSubstageProperties extends IBundleSubstageProperties {
  /**
   * The configuration used by the Webpack plugin. This must be populated
   * for Webpack to run. If webpackConfigFilePath is specified,
   * this will be populated automatically with the exports of the
   * config file referenced in that property.
   *
   * @remarks
   * Tapable event handlers can return `null` instead of `undefined` to suppress
   * other handlers from creating a configuration object.
   */
  // We are inheriting this problem from Tapable's API
  // eslint-disable-next-line @rushstack/no-new-null
  webpackConfiguration?: webpack.Configuration | webpack.Configuration[] | null;
}

/**
 * @public
 */
export interface IWebpackBuildStageProperties extends IBuildStageProperties {
  webpackStats?: webpack.Stats | webpack.compilation.MultiStats;
}
