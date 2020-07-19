// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as webpack from 'webpack';
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
            build.properties
          );
        });
      });
    });
  }

  private async _runWebpackAsync(
    baseTerminalProvider: ITerminalProvider,
    webpackConfiguration: IWebpackConfiguration,
    buildProperties: IBuildStageProperties
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

    // This statement needs the `as webpack.Configuration` cast because the TS compiler gets confused
    // by two of the overrides for the `webpack` function (one accepting a `webpack.Configuration`,
    // and the other accepting a `webpack.Configuration[]`). The compiler accepts this:
    // ```
    // Array.isArray(webpackConfiguration) ? webpack(webpackConfiguration) : webpack(webpackConfiguration)
    // ```
    // but that's unnecessary complexity
    const compiler: webpack.Compiler | webpack.MultiCompiler = webpack(
      webpackConfiguration as webpack.Configuration
    );

    if (buildProperties.watchMode) {
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
