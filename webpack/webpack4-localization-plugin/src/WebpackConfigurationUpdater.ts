// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { minimatch } from 'minimatch';
import type * as Webpack from 'webpack';

import type * as SetPublicPathPluginPackageType from '@rushstack/set-webpack-public-path-plugin';
import { type NewlineKind, Text } from '@rushstack/node-core-library';
import type { IgnoreStringFunction } from '@rushstack/localization-utilities';

import { Constants } from './utilities/Constants.ts';
import type { LocalizationPlugin } from './LocalizationPlugin.ts';
import type { ILocLoaderOptions } from './loaders/LocLoader.ts';
import type { IBaseLoaderOptions } from './loaders/LoaderFactory.ts';

export interface IWebpackConfigurationUpdaterOptions {
  pluginInstance: LocalizationPlugin;
  configuration: Webpack.Configuration;
  globsToIgnore: string[] | undefined;
  localeNameOrPlaceholder: string;
  resxNewlineNormalization: NewlineKind | undefined;
  ignoreMissingResxComments: boolean | undefined;
  ignoreString: IgnoreStringFunction | undefined;
}

const FILE_TOKEN_REGEX: RegExp = new RegExp(Text.escapeRegExp('[file]'));

export class WebpackConfigurationUpdater {
  public static amendWebpackConfigurationForMultiLocale(options: IWebpackConfigurationUpdaterOptions): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'LocLoader.js');
    const loaderOptions: ILocLoaderOptions = {
      pluginInstance: options.pluginInstance,
      resxNewlineNormalization: options.resxNewlineNormalization,
      ignoreMissingResxComments: options.ignoreMissingResxComments,
      ignoreString: options.ignoreString
    };

    WebpackConfigurationUpdater._addLoadersForLocFiles(options, loader, loaderOptions);

    WebpackConfigurationUpdater._tryUpdateLocaleTokenInPublicPathPlugin(options);

    WebpackConfigurationUpdater._tryUpdateSourceMapFilename(options.configuration);
  }

  public static amendWebpackConfigurationForInPlaceLocFiles(
    options: IWebpackConfigurationUpdaterOptions
  ): void {
    const loader: string = path.resolve(__dirname, 'loaders', 'InPlaceLocFileLoader.js');
    const loaderOptions: IBaseLoaderOptions = {
      resxNewlineNormalization: options.resxNewlineNormalization,
      ignoreMissingResxComments: options.ignoreMissingResxComments,
      ignoreString: options.ignoreString
    };

    WebpackConfigurationUpdater._addRulesToConfiguration(options.configuration, [
      {
        test: Constants.RESOURCE_FILE_NAME_REGEXP,
        use: [
          {
            loader: loader,
            options: loaderOptions
          }
        ],
        type: 'json',
        sideEffects: false
      }
    ]);
  }

  private static _tryUpdateLocaleTokenInPublicPathPlugin(options: IWebpackConfigurationUpdaterOptions): void {
    let setPublicPathPlugin: typeof SetPublicPathPluginPackageType.SetPublicPathPlugin | undefined;
    try {
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
    const { globsToIgnore, configuration } = options;
    const rules: Webpack.RuleSetCondition =
      globsToIgnore && globsToIgnore.length > 0
        ? {
            include: Constants.RESOURCE_FILE_NAME_REGEXP,
            exclude: (filePath: string): boolean =>
              globsToIgnore.some((glob: string): boolean => minimatch(filePath, glob))
          }
        : Constants.RESOURCE_FILE_NAME_REGEXP;
    WebpackConfigurationUpdater._addRulesToConfiguration(configuration, [
      {
        test: rules,
        use: [
          {
            loader: loader,
            options: loaderOptions
          }
        ],
        type: 'json',
        sideEffects: false
      }
    ]);
  }

  private static _addRulesToConfiguration(
    configuration: Webpack.Configuration,
    rules: Webpack.RuleSetRule[]
  ): void {
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

  private static _tryUpdateSourceMapFilename(configuration: Webpack.Configuration): void {
    if (!configuration.output) {
      configuration.output = {}; // This should never happen
    }

    if (configuration.output.sourceMapFilename !== undefined) {
      configuration.output.sourceMapFilename = configuration.output.sourceMapFilename.replace(
        FILE_TOKEN_REGEX,
        Constants.NO_LOCALE_SOURCE_MAP_FILENAME_TOKEN
      );
    }
  }
}
