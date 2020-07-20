// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as webpack from 'webpack';
import * as WebpackDevServer from 'webpack-dev-server';
import { LegacyAdapters, Terminal, ITerminalProvider } from '@rushstack/node-core-library';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { PrefixProxyTerminalProvider } from '../../utilities/PrefixProxyTerminalProvider';
import {
  IBuildStageContext,
  IBundleSubstage,
  IBuildStageProperties,
  IWebpackConfiguration
} from '../../stages/BuildStage';

const PLUGIN_NAME: string = 'WebpackPlugin';

export class WebpackPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftCompilation: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftCompilation.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runWebpackAsync(
            heftConfiguration.terminalProvider,
            bundle.properties.webpackConfiguration,
            build.properties,
            heftConfiguration.terminalProvider.supportsColor
          );
        });
      });
    });
  }

  private async _runWebpackAsync(
    baseTerminalProvider: ITerminalProvider,
    webpackConfiguration: IWebpackConfiguration,
    buildProperties: IBuildStageProperties,
    supportsColor: boolean
  ): Promise<void> {
    if (!webpackConfiguration) {
      return;
    }

    const webpackTerminalProvider: PrefixProxyTerminalProvider = new PrefixProxyTerminalProvider(
      baseTerminalProvider,
      '[webpack] '
    );
    const terminal: Terminal = new Terminal(webpackTerminalProvider);
    terminal.writeLine(`Using Webpack version ${webpack.version}`);

    const compiler: webpack.Compiler | webpack.MultiCompiler = Array.isArray(webpackConfiguration)
      ? webpack(webpackConfiguration) /* (webpack.Compilation[]) => webpack.MultiCompiler */
      : webpack(webpackConfiguration); /* (webpack.Compilation) => webpack.Compiler */

    if (buildProperties.serveMode) {
      // TODO: make these options configurable
      const options: WebpackDevServer.Configuration = {
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

      // TODO: the WebpackDevServer accepts a third parameter for a logger. We should make
      // use of that to make logging cleaner
      const devServer: WebpackDevServer = new WebpackDevServer(compiler, options);
      await new Promise((resolve: () => void, reject: (error: Error) => void) => {
        devServer.listen(options.port!, options.host!, (error: Error) => {
          if (error) {
            reject(error);
          }
        });
      });
    } else if (buildProperties.watchMode) {
      try {
        const stats: webpack.Stats = await LegacyAdapters.convertCallbackToPromise(
          compiler.watch.bind(compiler),
          {}
        );
        // eslint-disable-next-line require-atomic-updates
        buildProperties.webpackStats = stats;
      } catch (e) {
        // TODO: handle error better
        terminal.writeErrorLine(e);
        throw e;
      }
    } else {
      try {
        const stats: webpack.Stats = await LegacyAdapters.convertCallbackToPromise(
          compiler.run.bind(compiler)
        );
        // eslint-disable-next-line require-atomic-updates
        buildProperties.webpackStats = stats;
      } catch (e) {
        // TODO: handle error better
        terminal.writeErrorLine(e);
        throw e;
      }
    }
  }
}
