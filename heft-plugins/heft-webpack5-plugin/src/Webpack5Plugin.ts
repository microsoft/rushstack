// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TWebpack from 'webpack';
import type TWebpackDevServer from 'webpack-dev-server';
import { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook } from 'tapable';
import { FileError, LegacyAdapters } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskCleanHookOptions,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IScopedLogger
} from '@rushstack/heft';

import type {
  IWebpackConfiguration,
  IWebpackConfigurationWithDevServer,
  IWebpack5PluginAccessor
} from './shared';
import { WebpackConfigurationLoader } from './WebpackConfigurationLoader';

export interface IWebpack5PluginOptions {
  devConfigurationPath: string | undefined;
  configurationPath: string | undefined;
}

/**
 * @public
 */
export const PLUGIN_NAME: 'Webpack5Plugin' = 'Webpack5Plugin';
const WEBPACK_DEV_SERVER_PACKAGE_NAME: 'webpack-dev-server' = 'webpack-dev-server';
const WEBPACK_DEV_SERVER_ENV_VAR_NAME: 'WEBPACK_DEV_SERVER' = 'WEBPACK_DEV_SERVER';
const UNINITIALIZED: 'UNINITIALIZED' = 'UNINITIALIZED';

/**
 * @internal
 */
export default class Webpack5Plugin implements IHeftTaskPlugin<IWebpack5PluginOptions> {
  private _webpack: typeof TWebpack | undefined;
  private _webpackConfiguration: IWebpackConfiguration | undefined | typeof UNINITIALIZED = UNINITIALIZED;

  public readonly accessor: IWebpack5PluginAccessor = {
    hooks: {
      onLoadConfiguration: new AsyncSeriesBailHook(),
      onConfigure: new AsyncSeriesHook(['webpackConfiguration']),
      onAfterConfigure: new AsyncParallelHook(['webpackConfiguration']),
      onEmitStats: new AsyncParallelHook(['webpackStats'])
    }
  };

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpack5PluginOptions
  ): void {
    // These get set in the run hook and used in the onConfigureWebpackHook
    let production: boolean;
    let serveMode: boolean;
    let watchMode: boolean;

    // Provide the initial webpack configuration by tapping the hook. Tap with stage as
    // MAX_SAFE_INTEGER to ensure that we run last.
    this.accessor.hooks.onLoadConfiguration.tapPromise(
      { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
      async () => {
        taskSession.logger.terminal.writeVerboseLine('Loading default Webpack configuration');
        const configurationLoader: WebpackConfigurationLoader = new WebpackConfigurationLoader(
          taskSession.logger,
          production,
          serveMode
        );
        const webpack: typeof TWebpack = await this._loadWebpackAsync();
        return await configurationLoader.tryLoadWebpackConfigurationAsync({
          ...options,
          taskSession,
          heftConfiguration,
          webpack
        });
      }
    );

    taskSession.hooks.clean.tapPromise(PLUGIN_NAME, async (cleanOptions: IHeftTaskCleanHookOptions) => {
      // Obtain the finalized webpack configuration
      const webpackConfiguration: IWebpackConfiguration | undefined =
        await this._getWebpackConfigurationAsync();
      if (webpackConfiguration) {
        const webpackConfigurationArray: IWebpackConfigurationWithDevServer[] = Array.isArray(
          webpackConfiguration
        )
          ? webpackConfiguration
          : [webpackConfiguration];

        // Add each output path to the clean list
        for (const config of webpackConfigurationArray) {
          if (config.output?.path) {
            cleanOptions.addDeleteOperations({ sourcePath: config.output.path });
          }
        }
      }
    });

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      production = runOptions.production;
      // TODO: Support watch mode
      watchMode = false;
      // TODO: Support serve mode
      serveMode = false;

      // Run webpack with the finalized webpack configuration
      const webpackConfiguration: IWebpackConfiguration | undefined =
        await this._getWebpackConfigurationAsync();
      await this._runWebpackAsync(taskSession, heftConfiguration, webpackConfiguration, serveMode, watchMode);
    });
  }

  private async _loadWebpackAsync(): Promise<typeof TWebpack> {
    if (!this._webpack) {
      this._webpack = await import('webpack');
    }
    return this._webpack;
  }

  private async _getWebpackConfigurationAsync(): Promise<IWebpackConfiguration | undefined> {
    if (this._webpackConfiguration === UNINITIALIZED) {
      // Obtain the webpack configuration by calling into the hook. This hook is always used
      // since the this plugin taps the hook to provide the default configuration.
      const webpackConfiguration: IWebpackConfiguration | false =
        (await this.accessor.hooks.onLoadConfiguration.promise())!;

      if (webpackConfiguration === false) {
        // It is initialized, but suppressed. Set the configuration to undefined.
        this._webpackConfiguration = undefined;
      } else {
        this._webpackConfiguration = webpackConfiguration;
        if (webpackConfiguration) {
          if (this.accessor.hooks.onConfigure.isUsed()) {
            // Allow for plugins to customise the configuration
            await this.accessor.hooks.onConfigure.promise(webpackConfiguration);
          }
          if (this.accessor.hooks.onAfterConfigure.isUsed()) {
            // Provide the finalized configuration
            await this.accessor.hooks.onAfterConfigure.promise(webpackConfiguration);
          }
        }
      }
    }
    return this._webpackConfiguration;
  }

  private async _runWebpackAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    webpackConfiguration: IWebpackConfiguration | undefined,
    serveMode: boolean,
    watchMode: boolean
  ): Promise<void> {
    const logger: IScopedLogger = taskSession.logger;

    if (!webpackConfiguration) {
      logger.terminal.writeLine('Webpack configuration suppressed, running Webpack skipped');
      return;
    }

    const webpack: typeof TWebpack = await this._loadWebpackAsync();
    logger.terminal.writeLine(`Using Webpack version ${webpack.version}`);

    let compiler: TWebpack.Compiler | TWebpack.MultiCompiler;
    if (Array.isArray(webpackConfiguration)) {
      if (webpackConfiguration.length === 0) {
        logger.terminal.writeLine('The webpack configuration is an empty array - nothing to do.');
        return;
      } else {
        compiler = webpack.default(webpackConfiguration); /* (webpack.Compilation[]) => MultiCompiler */
      }
    } else {
      compiler = webpack.default(webpackConfiguration); /* (webpack.Compilation) => Compiler */
    }

    if (serveMode) {
      const defaultDevServerOptions: TWebpackDevServer.Configuration = {
        host: 'localhost',
        devMiddleware: {
          publicPath: '/',
          stats: {
            cached: false,
            cachedAssets: false,
            colors: heftConfiguration.terminalProvider.supportsColor
          }
        },
        client: {
          logging: 'info'
        },
        port: 8080
      };

      let options: TWebpackDevServer.Configuration;
      if (Array.isArray(webpackConfiguration)) {
        const devServerOptions: TWebpackDevServer.Configuration[] = webpackConfiguration
          .map((configuration) => configuration.devServer)
          .filter((devServer): devServer is TWebpackDevServer.Configuration => !!devServer);
        if (devServerOptions.length > 1) {
          logger.emitWarning(
            new Error(`Detected multiple webpack devServer configurations, using the first one.`)
          );
        }

        if (devServerOptions.length > 0) {
          options = { ...defaultDevServerOptions, ...devServerOptions[0] };
        } else {
          options = defaultDevServerOptions;
        }
      } else {
        options = { ...defaultDevServerOptions, ...webpackConfiguration.devServer };
      }

      // Register a plugin to callback after webpack is done with the first compilation
      // so we can move on to post-build
      let firstCompilationDoneCallback: (() => void) | undefined;
      compiler.hooks.done.tap(PLUGIN_NAME, () => {
        if (firstCompilationDoneCallback) {
          firstCompilationDoneCallback();
          firstCompilationDoneCallback = undefined;
        }
      });

      // The webpack-dev-server package has a design flaw, where merely loading its package will set the
      // WEBPACK_DEV_SERVER environment variable -- even if no APIs are accessed. This environment variable
      // causes incorrect behavior if Heft is not running in serve mode. Thus, we need to be careful to call
      // require() only if Heft is in serve mode.
      const WebpackDevServer: typeof TWebpackDevServer = await import(WEBPACK_DEV_SERVER_PACKAGE_NAME);
      const webpackDevServer: TWebpackDevServer = new WebpackDevServer(options, compiler);

      await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        firstCompilationDoneCallback = resolve;
        webpackDevServer.start().catch(reject);
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

      let stats: TWebpack.Stats | TWebpack.MultiStats | undefined;
      if (watchMode) {
        try {
          stats = await LegacyAdapters.convertCallbackToPromise(
            (compiler as TWebpack.Compiler).watch.bind(compiler),
            {}
          );
        } catch (e) {
          logger.emitError(e as Error);
        }
      } else {
        try {
          stats = await LegacyAdapters.convertCallbackToPromise(
            (compiler as TWebpack.Compiler).run.bind(compiler)
          );
          await LegacyAdapters.convertCallbackToPromise(compiler.close.bind(compiler));
        } catch (e) {
          logger.emitError(e as Error);
        }
      }

      if (stats) {
        this._emitErrors(logger, stats, heftConfiguration.buildFolder);
        if (this.accessor.hooks.onEmitStats.isUsed()) {
          await this.accessor.hooks.onEmitStats.promise(stats);
        }
      }
    }
  }

  private _emitErrors(
    logger: IScopedLogger,
    stats: TWebpack.Stats | TWebpack.MultiStats,
    buildFolder: string
  ): void {
    if (stats.hasErrors() || stats.hasWarnings()) {
      const serializedStats: TWebpack.StatsCompilation = stats.toJson('errors-warnings');

      if (serializedStats.warnings) {
        for (const warning of serializedStats.warnings) {
          logger.emitWarning(this._normalizeError(buildFolder, warning));
        }
      }

      if (serializedStats.errors) {
        for (const error of serializedStats.errors) {
          logger.emitError(this._normalizeError(buildFolder, error));
        }
      }
    }
  }

  private _normalizeError(buildFolder: string, error: TWebpack.StatsError): Error {
    if (error instanceof Error) {
      return error;
    } else if (error.moduleIdentifier) {
      let lineNumber: number | undefined;
      let columnNumber: number | undefined;
      if (error.loc) {
        // Format of "<line>:<columnStart>-<columnEnd>"
        // https://webpack.js.org/api/stats/#errors-and-warnings
        const [lineNumberRaw, columnRangeRaw] = error.loc.split(':');
        const [startColumnRaw] = columnRangeRaw.split('-');
        if (lineNumberRaw) {
          lineNumber = parseInt(lineNumberRaw, 10);
          if (isNaN(lineNumber)) {
            lineNumber = undefined;
          }
        }
        if (startColumnRaw) {
          columnNumber = parseInt(startColumnRaw, 10);
          if (isNaN(columnNumber)) {
            columnNumber = undefined;
          }
        }
      }

      return new FileError(error.message, {
        absolutePath: error.moduleIdentifier,
        projectFolder: buildFolder,
        line: lineNumber,
        column: columnNumber
      });
    } else {
      return new Error(error.message);
    }
  }
}
