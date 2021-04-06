// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Configuration as WebpackDevServerConfiguration } from 'webpack-dev-server';
import * as webpack from 'webpack';
import { IBuildStageProperties, IBundleSubstageProperties } from '@rushstack/heft';
import { IPackageJson, PackageJsonLookup } from '@rushstack/node-core-library';

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
   */
  webpackConfiguration?: webpack.Configuration | webpack.Configuration[];
}

/**
 * @public
 */
export const WEBPACK_STATS_SYMBOL: unique symbol = Symbol('webpack-stats');

/**
 * @public
 */
export interface IWebpackBuildStageProperties extends IBuildStageProperties {
  [WEBPACK_STATS_SYMBOL]?: webpack.Stats | webpack.compilation.MultiStats;
}

export interface IWebpackVersions {
  webpackVersion: string;
  webpackDevServerVersion: string;
}

let _webpackVersions: IWebpackVersions | undefined;
export function getWebpackVersions(): IWebpackVersions {
  if (!_webpackVersions) {
    const packageJson: IPackageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);
    _webpackVersions = {
      // eslint-disable-next-line dot-notation
      webpackVersion: packageJson.dependencies!['webpack'],
      webpackDevServerVersion: packageJson.dependencies!['webpack-dev-server']
    };
  }

  return _webpackVersions;
}
