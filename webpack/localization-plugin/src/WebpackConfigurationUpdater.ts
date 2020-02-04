// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as Webpack from 'webpack';
import * as SetPublicPathPluginPackageType from '@microsoft/set-webpack-public-path-plugin';

import { Constants } from './utilities/Constants';
import { LocalizationPlugin } from './LocalizationPlugin';
import { IBaseLoaderOptions } from './loaders/LoaderFactory';
import { ISingleLocaleLoaderOptions } from './loaders/SingleLocaleLoader';
import { ILocLoaderOptions } from './loaders/LocLoader';

export interface IWebpackConfigurationUpdaterOptions {
  pluginInstance: LocalizationPlugin;
  configuration: Webpack.Configuration;
  locFiles: Set<string>;
  filesToIgnore: Set<string>;
  localeNameOrPlaceholder: string;
  exportAsDefault: boolean;
}

export interface ISingleLocaleConfigOptions extends IWebpackConfigurationUpdaterOptions {
  localeName: string;
  resolvedStrings: Map<string, Map<string, string>>;
  passthroughLocale: boolean;
}

export class WebpackConfigurationUpdater {
  public static amendWebpackConfigurationForMultiLocale(options: IWebpackConfigurationUpdaterOptions): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'LocLoader.js');
    const loaderOptions: ILocLoaderOptions = {
      pluginInstance: options.pluginInstance,
      exportAsDefault: options.exportAsDefault
    };

    WebpackConfigurationUpdater._addLoadersForProvidedLocFiles(options, loader, loaderOptions);

    WebpackConfigurationUpdater._tryUpdateLocaleTokenInPublicPathPlugin(options);
  }

  public static amendWebpackConfigurationForSingleLocale(options: ISingleLocaleConfigOptions): void {
    // We can cheat on the validation a bit here because _initializeAndValidateOptions already validated this
    options.configuration.output!.filename = (options.configuration.output!.filename as string).replace(
      Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
      options.localeName
    );
    if (options.configuration.output!.chunkFilename) {
      options.configuration.output!.chunkFilename = (options.configuration.output!.chunkFilename as string).replace(
        Constants.LOCALE_FILENAME_PLACEHOLDER_REGEX,
        options.localeName
      );
    }

    const loader: string = path.resolve(__dirname, 'loaders', 'SingleLocaleLoader.js');
    const loaderOptions: ISingleLocaleLoaderOptions = {
      resolvedStrings: options.resolvedStrings,
      passthroughLocale: options.passthroughLocale,
      exportAsDefault: options.exportAsDefault
    };
    WebpackConfigurationUpdater._addLoadersForProvidedLocFiles(options, loader, loaderOptions);

    WebpackConfigurationUpdater._tryUpdateLocaleTokenInPublicPathPlugin({
      ...options,
      localeNameOrPlaceholder: options.localeName
    });
  }

  public static amendWebpackConfigurationForInPlaceLocFiles(options: IWebpackConfigurationUpdaterOptions): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'InPlaceLocFileLoader.js');
    const loaderOptions: IBaseLoaderOptions = {
      exportAsDefault: options.exportAsDefault
    }

    WebpackConfigurationUpdater._addRulesToConfiguration(
      options.configuration,
      [
        {
          test: /\.loc\.json$/i,
          loader: loader
        },
        {
          test: /\.resx$/i,
          use: [
            require.resolve('json-loader'),
            {
              loader,
              options: loaderOptions
            }
          ]
        }
      ]
    );
  }

  private static _tryUpdateLocaleTokenInPublicPathPlugin(options: IWebpackConfigurationUpdaterOptions): void {
    let setPublicPathPlugin: typeof SetPublicPathPluginPackageType.SetPublicPathPlugin | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pluginPackage: typeof SetPublicPathPluginPackageType = require('@microsoft/set-webpack-public-path-plugin');
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

  private static _addLoadersForProvidedLocFiles(
    options: IWebpackConfigurationUpdaterOptions,
    loader: string,
    loaderOptions: IBaseLoaderOptions
  ): void {
    WebpackConfigurationUpdater._addRulesAndWarningLoaderToConfiguration(
      options,
      [
        {
          test: {
            and: [
              (filePath: string) => options.locFiles.has(filePath),
              /\.loc\.json$/i
            ]
          },
          loader: loader,
          options: loaderOptions
        },
        {
          test: {
            and: [
              (filePath: string) => options.locFiles.has(filePath),
              /\.resx$/i
            ]
          },
          use: [
            require.resolve('json-loader'),
            {
              loader: loader,
              options: loaderOptions
            }
          ]
        }
      ]
    );
  }

  private static _addRulesAndWarningLoaderToConfiguration(
    options: IWebpackConfigurationUpdaterOptions,
    rules: Webpack.RuleSetRule[]
  ): void {
    WebpackConfigurationUpdater._addRulesToConfiguration(
      options.configuration,
      [
        ...rules,
        {
          test: {
            and: [
              (filePath: string) => !options.locFiles.has(filePath),
              (filePath: string) => !options.filesToIgnore.has(filePath),
              {
                or: [
                  /\.loc\.json$/i,
                  /\.resx$/i
                ]
              }
            ]
          },
          loader: path.resolve(__dirname, 'loaders', 'MissingLocDataWarningLoader.js')
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