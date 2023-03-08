// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { type FolderItem, FileSystem } from '@rushstack/node-core-library';
import type * as webpack from 'webpack';
import type { IBuildStageProperties, ScopedLogger } from '@rushstack/heft';

import { IWebpackConfiguration } from './shared';

/**
 * See https://webpack.js.org/api/cli/#environment-options
 */
interface IWebpackConfigFunctionEnv {
  prod: boolean;
  production: boolean;
}
type IWebpackConfigJsExport =
  | webpack.Configuration
  | webpack.Configuration[]
  | Promise<webpack.Configuration>
  | Promise<webpack.Configuration[]>
  | ((env: IWebpackConfigFunctionEnv) => webpack.Configuration | webpack.Configuration[])
  | ((env: IWebpackConfigFunctionEnv) => Promise<webpack.Configuration | webpack.Configuration[]>);
type IWebpackConfigJs = IWebpackConfigJsExport | { default: IWebpackConfigJsExport };

interface IWebpackConfigFileNames {
  dev: string;
  prod: string;
}

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

    const webpackConfigFileNames: IWebpackConfigFileNames | undefined = await findWebpackConfigAsync(
      buildFolder
    );
    const webpackDevConfigFilename: string | undefined = webpackConfigFileNames.dev;
    const webpackConfigFilename: string | undefined = webpackConfigFileNames.prod;

    let webpackConfigJs: IWebpackConfigJs | undefined;

    try {
      if (buildProperties.serveMode) {
        logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${webpackDevConfigFilename}".`
        );
        webpackConfigJs = WebpackConfigurationLoader._tryLoadWebpackConfiguration(
          buildFolder,
          webpackDevConfigFilename
        );
      }

      if (!webpackConfigJs) {
        logger.terminal.writeVerboseLine(
          `Attempting to load webpack configuration from "${webpackConfigFilename}".`
        );
        webpackConfigJs = WebpackConfigurationLoader._tryLoadWebpackConfiguration(
          buildFolder,
          webpackConfigFilename
        );
      }
    } catch (error) {
      logger.emitError(error as Error);
    }

    if (webpackConfigJs) {
      const webpackConfig: IWebpackConfigJsExport =
        (webpackConfigJs as { default: IWebpackConfigJsExport }).default || webpackConfigJs;

      if (typeof webpackConfig === 'function') {
        return webpackConfig({ prod: buildProperties.production, production: buildProperties.production });
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

async function findWebpackConfigAsync(buildFolder: string): Promise<IWebpackConfigFileNames> {
  try {
    const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(buildFolder);
    const dev: string[] = [];
    const prod: string[] = [];
    for (let folderItem of folderItems) {
      if (folderItem.isFile() && folderItem.name.match(/^webpack.dev.config\.(cjs|js|mjs)$/)) {
        dev.push(folderItem.name);
      } else if (folderItem.isFile() && folderItem.name.match(/^webpack.config\.(cjs|js|mjs)$/)) {
        prod.push(folderItem.name);
      }
    }

    if (dev.length > 1 || prod.length > 1) {
      throw new Error(`Error: Found more than one matching webpack configuration files.`);
    }
    return {
      dev: dev[0] ?? WEBPACK_DEV_CONFIG_FILENAME,
      prod: prod[0] ?? WEBPACK_CONFIG_FILENAME
    };
  } catch (e) {
    throw new Error(`Error finding webpack configuration: ${e}`);
  }
}
