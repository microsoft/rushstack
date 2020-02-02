// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as Webpack from 'webpack';

import { Constants } from './utilities/Constants';
import { LocalizationPlugin } from './LocalizationPlugin';

export interface IWebpackConfigurationUpdaterOptions {
  configuration: Webpack.Configuration;
  locFiles: Set<string>;
  filesToIgnore: Set<string>;
  pluginInstance: LocalizationPlugin
}

export interface ISingleLocaleConfigOptions extends IWebpackConfigurationUpdaterOptions {
  localeName: string;
  resolvedStrings: Map<string, Map<string, string>>;
  passthroughLocale: boolean;
}

export class WebpackConfigurationUpdater {
  public static amendWebpackConfigurationForMultiLocale(options: IWebpackConfigurationUpdaterOptions): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'LocLoader.js');
    const loaderOptions: Webpack.RuleSetQuery = {
      pluginInstance: options.pluginInstance
    };

    WebpackConfigurationUpdater._addLoadersForProvidedLocFiles(options, loader, loaderOptions);
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
    const loaderOptions: Webpack.RuleSetQuery = {
      resolvedStrings: options.resolvedStrings,
      passthroughLocale: options.passthroughLocale
    };
    WebpackConfigurationUpdater._addLoadersForProvidedLocFiles(options, loader, loaderOptions);
  }

  public static amendWebpackConfigurationForInPlaceLocFiles(configuration: Webpack.Configuration): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'InPlaceLocFileLoader.js');

    WebpackConfigurationUpdater._addRulesToConfiguration(
      configuration,
      [
        {
          test: /\.loc\.json$/i,
          loader: loader
        },
        {
          test: /\.resx$/i,
          use: [
            require.resolve('json-loader'),
            loader
          ]
        }
      ]
    );
  }

  private static _addLoadersForProvidedLocFiles(
    options: IWebpackConfigurationUpdaterOptions,
    loader: string,
    loaderOptions: Webpack.RuleSetQuery
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