// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, IBundleSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';

const PLUGIN_NAME: string = 'webpack-warning-plugin';

export class WebpackWarningPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          let hasWebpackPlugin: boolean = false;
          let hasBasicConfigureWebpackPlugin: boolean = false;
          for (const tap of bundle.hooks.run.taps) {
            if (tap.name === 'BasicConfigureWebpackPlugin') {
              hasBasicConfigureWebpackPlugin = true;
            } else if (tap.name === 'WebpackPlugin') {
              hasWebpackPlugin = true;
            }
          }

          await this._warnIfWebpackIsMissingAsync(
            heftSession,
            heftConfiguration,
            !!bundle.properties.webpackConfiguration,
            hasWebpackPlugin,
            hasBasicConfigureWebpackPlugin
          );
        });
      });
    });
  }

  private async _warnIfWebpackIsMissingAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    webpackConfigIsProvided: boolean,
    hasWebpackPlugin: boolean,
    hasBasicConfigureWebpackPlugin: boolean
  ): Promise<void> {
    if (hasWebpackPlugin && hasBasicConfigureWebpackPlugin) {
      // If we have both plugins, we don't need to check for anything else
      return;
    }

    if (webpackConfigIsProvided && hasWebpackPlugin) {
      // If the webpack config is already provided by some other plugin, we don't have to care about the
      // BasicConfigureWebpackPlugin
      return;
    }

    if (webpackConfigIsProvided && !hasWebpackPlugin) {
      const logger: ScopedLogger = heftSession.requestScopedLogger(PLUGIN_NAME);
      logger.emitWarning(
        new Error(
          'A webpack configuration is provided, but the webpack plugin is missing. ' +
            'You need to include the @rushstack/heft-webpack4-plugin plugin package ' +
            'and reference lib/WebpackPlugin in config/heft.json.'
        )
      );
      return;
    }

    const webpackConfigFilename: string = 'webpack.config.js';
    const webpackConfigFileExists: boolean = await FileSystem.exists(
      `${heftConfiguration.buildFolder}/${webpackConfigFilename}`
    );
    if (webpackConfigFileExists) {
      const logger: ScopedLogger = heftSession.requestScopedLogger(PLUGIN_NAME);
      if (hasWebpackPlugin && !hasBasicConfigureWebpackPlugin) {
        logger.emitWarning(
          new Error(
            `A ${webpackConfigFilename} file exists in this project ` +
              'but the BasicConfigureWebpackPlugin plugin is missing. ' +
              'You probably want to include the @rushstack/heft-webpack4-plugin plugin package ' +
              'and reference lib/BasicConfigureWebpackPlugin in config/heft.json.'
          )
        );
      } else {
        logger.emitWarning(
          new Error(
            `A ${webpackConfigFilename} file exists in this project ` +
              'but the BasicConfigureWebpackPlugin plugin is missing. ' +
              'You probably want to include the @rushstack/heft-webpack4-plugin plugin package ' +
              'and reference lib/BasicConfigureWebpackPlugin and lib/WebpackPlugin in config/heft.json.'
          )
        );
      }
    }
  }
}
