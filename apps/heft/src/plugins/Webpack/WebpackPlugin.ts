// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as webpack from 'webpack';
import /* type */ * as TWebpackDevServer from 'webpack-dev-server';
import { LegacyAdapters } from '@rushstack/node-core-library';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import {
  IBuildStageContext,
  IBundleSubstage,
  IBuildStageProperties,
  IWebpackConfiguration
} from '../../stages/BuildStage';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';

const PLUGIN_NAME: string = 'WebpackPlugin';
const WEBPACK_DEV_SERVER_PACKAGE_NAME: string = 'webpack-dev-server';
const WEBPACK_DEV_SERVER_ENV_VAR_NAME: string = 'WEBPACK_DEV_SERVER';

export class WebpackPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runWebpackAsync(
            heftSession,
            bundle.properties.webpackConfiguration,
            build.properties,
            heftConfiguration.terminalProvider.supportsColor
          );
        });
      });
    });
  }

  private async _runWebpackAsync(
    heftSession: HeftSession,
    webpackConfiguration: IWebpackConfiguration,
    buildProperties: IBuildStageProperties,
    supportsColor: boolean
  ): Promise<void> {
    if (!webpackConfiguration) {
      return;
    }

    const logger: ScopedLogger = heftSession.requestScopedLogger('webpack');
    logger.terminal.writeLine(`Using Webpack version ${webpack.version}`);

    const compiler: webpack.Compiler | webpack.MultiCompiler = Array.isArray(webpackConfiguration)
      ? webpack(webpackConfiguration) /* (webpack.Compilation[]) => webpack.MultiCompiler */
      : webpack(webpackConfiguration); /* (webpack.Compilation) => webpack.Compiler */

    if (buildProperties.serveMode) {
      // TODO: make these options configurable
      const options: TWebpackDevServer.Configuration = {
        host: 'localhost',
        publicPath: '/',
        filename: '[name]_[hash].js',
        clientLogLevel: 'info',
        stats: {
          cached: false,
          cachedAssets: false,
          colors: supportsColor
        },
        port: 8080
      };

      // The webpack-dev-server package has a design flaw, where merely loading its package will set the
      // WEBPACK_DEV_SERVER environment variable -- even if no APIs are accessed. This environment variable
      // causes incorrect behavior if Heft is not running in serve mode. Thus, we need to be careful to call require()
      // only if Heft is in serve mode.
      const WebpackDevServer: typeof TWebpackDevServer = require(WEBPACK_DEV_SERVER_PACKAGE_NAME);
      // TODO: the WebpackDevServer accepts a third parameter for a logger. We should make
      // use of that to make logging cleaner
      const devServer: TWebpackDevServer = new WebpackDevServer(compiler, options);
      await new Promise((resolve: () => void, reject: (error: Error) => void) => {
        devServer.listen(options.port!, options.host!, (error: Error) => {
          if (error) {
            reject(error);
          }
        });
      });
    } else {
      if (process.env[WEBPACK_DEV_SERVER_ENV_VAR_NAME]) {
        logger.emitWarning(
          new Error(
            `The "${WEBPACK_DEV_SERVER_ENV_VAR_NAME}" environment variable is set, ` +
              'which will cause problems when webpack is not running in serve mode. ' +
              `(Did a dependency inadvertently load the "${WEBPACK_DEV_SERVER_PACKAGE_NAME}" package?)`
          )
        );
      }

      let stats: webpack.Stats | undefined;
      if (buildProperties.watchMode) {
        try {
          stats = await LegacyAdapters.convertCallbackToPromise(compiler.watch.bind(compiler), {});
        } catch (e) {
          logger.emitError(e);
        }
      } else {
        try {
          stats = await LegacyAdapters.convertCallbackToPromise(compiler.run.bind(compiler));
        } catch (e) {
          logger.emitError(e);
        }
      }

      if (stats) {
        // eslint-disable-next-line require-atomic-updates
        buildProperties.webpackStats = stats;

        this._emitErrors(logger, stats);
      }
    }
  }

  private _emitErrors(logger: ScopedLogger, stats: webpack.Stats): void {
    if (stats.hasErrors() || stats.hasWarnings()) {
      const serializedStats: webpack.Stats.ToJsonOutput = stats.toJson('errors-warnings');

      for (const warning of serializedStats.warnings as (string | Error)[]) {
        logger.emitWarning(warning instanceof Error ? warning : new Error(warning));
      }

      for (const error of serializedStats.errors as (string | Error)[]) {
        logger.emitError(error instanceof Error ? error : new Error(error));
      }
    }
  }
}
