// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Import } from '@rushstack/node-core-library';
import type { Configuration } from 'webpack';
import type { IBuildStageProperties, ScopedLogger } from '@rushstack/heft';

import { IWebpackConfiguration } from './shared';

const webpack: typeof import('webpack') = Import.lazy('webpack', require);

/**
 * See https://webpack.js.org/api/cli/#environment-options
 */
interface IWebpackConfigFunctionEnv {
  prod: boolean;
  production: boolean;
  webpack: typeof webpack;
}
type IWebpackConfigJsExport =
  | Configuration
  | Configuration[]
  | Promise<Configuration>
  | Promise<Configuration[]>
  | ((env: IWebpackConfigFunctionEnv) => Configuration | Configuration[])
  | ((env: IWebpackConfigFunctionEnv) => Promise<Configuration | Configuration[]>);
type IWebpackConfigJs = IWebpackConfigJsExport | { default: IWebpackConfigJsExport };

const WEBPACK_CONFIG_FILENAME: string = 'webpack.config.js';
const WEBPACK_DEV_CONFIG_FILENAME: string = 'webpack.dev.config.js';

export class WebpackConfigurationLoader {
  public static async tryLoadWebpackConfigAsync(
    logger: ScopedLogger,
    buildFolder: string,
    buildProperties: IBuildStageProperties
  ): Promise<IWebpackConfiguration | undefined> {
    // TODO: Eventually replace this custom logic with a call to this utility in in webpack-cli:
    // https://github.com/webpack/webpack-cli/blob/next/packages/webpack-cli/lib/groups/ConfigGroup.js

    let webpackConfigJs: IWebpackConfigJs | undefined;

    try {
      if (buildProperties.serveMode) {
        logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${WEBPACK_DEV_CONFIG_FILENAME}".`
        );
        webpackConfigJs = WebpackConfigurationLoader._tryLoadWebpackConfiguration(
          buildFolder,
          WEBPACK_DEV_CONFIG_FILENAME
        );
      }

      if (!webpackConfigJs) {
        logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${WEBPACK_CONFIG_FILENAME}".`
        );
        webpackConfigJs = WebpackConfigurationLoader._tryLoadWebpackConfiguration(
          buildFolder,
          WEBPACK_CONFIG_FILENAME
        );
      }
    } catch (error) {
      logger.emitError(error as Error);
    }

    if (webpackConfigJs) {
      const webpackConfig: IWebpackConfigJsExport =
        (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

      if (typeof webpackConfig === 'function') {
        return webpackConfig({
          prod: buildProperties.production,
          production: buildProperties.production,
          webpack
        });
      } else {
        return webpackConfig;
      }
    } else {
      return undefined;
    }
  }

  private static _tryLoadWebpackConfiguration(
    buildFolder: string,
    configurationFilename: string
  ): IWebpackConfigJs | undefined {
    const fullWebpackConfigPath: string = path.join(buildFolder, configurationFilename);
    if (FileSystem.exists(fullWebpackConfigPath)) {
      try {
        return require(fullWebpackConfigPath);
      } catch (e) {
        throw new Error(`Error loading webpack configuration at "${fullWebpackConfigPath}": ${e}`);
      }
    } else {
      return undefined;
    }
  }
}
