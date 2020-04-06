// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as Webpack from 'webpack';
import * as SetPublicPathPluginPackageType from '@rushstack/set-webpack-public-path-plugin';
import { NewlineKind } from '@rushstack/node-core-library';

import { Constants } from './utilities/Constants';
import { LocalizationPlugin } from './LocalizationPlugin';
import { ILocLoaderOptions } from './loaders/LocLoader';
import { IBaseLoaderOptions } from './loaders/LoaderFactory';

export interface IWebpackConfigurationUpdaterOptions {
  pluginInstance: LocalizationPlugin;
  configuration: Webpack.Configuration;
  filesToIgnore: Set<string>;
  localeNameOrPlaceholder: string;
  resxNewlineNormalization: NewlineKind | undefined;
}

export class WebpackConfigurationUpdater {
  public static amendWebpackConfigurationForMultiLocale(options: IWebpackConfigurationUpdaterOptions): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'LocLoader.js');
    const loaderOptions: ILocLoaderOptions = {
      pluginInstance: options.pluginInstance,
      resxNewlineNormalization: options.resxNewlineNormalization
    };

    WebpackConfigurationUpdater._addLoadersForLocFiles(options, loader, loaderOptions);

    WebpackConfigurationUpdater._tryUpdateLocaleTokenInPublicPathPlugin(options);
  }

  public static amendWebpackConfigurationForInPlaceLocFiles(options: IWebpackConfigurationUpdaterOptions): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'InPlaceLocFileLoader.js');
    const loaderOptions: IBaseLoaderOptions = {
      resxNewlineNormalization: options.resxNewlineNormalization
    };

    WebpackConfigurationUpdater._addRulesToConfiguration(
      options.configuration,
      [
        {
          test: Constants.LOC_JSON_REGEX,
          use: [{
            loader: loader,
            options: loaderOptions
          }]
        },
        {
          test: Constants.RESX_REGEX,
          use: [{
            loader: loader,
            options: loaderOptions
          }],
          type: 'json'
        }
      ]
    );
  }

  private static _tryUpdateLocaleTokenInPublicPathPlugin(options: IWebpackConfigurationUpdaterOptions): void {
    let setPublicPathPlugin: typeof SetPublicPathPluginPackageType.SetPublicPathPlugin | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pluginPackage: typeof SetPublicPathPluginPackageType = require('@rushstack/set-webpack-public-path-plugin');
      setPublicPathPlugin = pluginPackage.SetPublicPathPlugin;
    } catch (e) {
      // public path plugin isn't present - ignore
    }

    if (setPublicPathPlugin && options.configuration.plugins) {
      for (const plugin of options.configuration.plugins) {
        if (plugin instanceof setPublicPathPlugin) {
          if (
            plugin.options &&
            plugin.options.scriptName &&
            plugin.options.scriptName.isTokenized &&
            plugin.options.scriptName.name
          ) {
            plugin.options.scriptName.name = plugin.options.scriptName.name.replace(
              /\[locale\]/g,
              options.localeNameOrPlaceholder
            );
          }
        }
      }
    }
  }

  private static _addLoadersForLocFiles(
    options: IWebpackConfigurationUpdaterOptions,
    loader: string,
    loaderOptions: IBaseLoaderOptions
  ): void {
    WebpackConfigurationUpdater._addRulesToConfiguration(
      options.configuration,
      [
        {
          test: {
            and: [
              (filePath: string) => !options.filesToIgnore.has(filePath),
              Constants.LOC_JSON_REGEX
            ]
          },
          use: [{
            loader: loader,
            options: loaderOptions
          }]
        },
        {
          test: {
            and: [
              (filePath: string) => !options.filesToIgnore.has(filePath),
              Constants.RESX_REGEX
            ]
          },
          use: [{
            loader: loader,
            options: loaderOptions
          }],
          type: 'json'
        }
      ]
    );
  }

  private static _addRulesToConfiguration(configuration: Webpack.Configuration, rules: Webpack.RuleSetRule[]): void {
    if (!configuration.module) {
      configuration.module = {
        rules: []
      };
    }

    if (!configuration.module.rules) {
      configuration.module.rules = [];
    }

    configuration.module.rules.push(...rules);
  }
}
