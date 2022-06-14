// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodePath from 'path';
import { AsyncParallelHook, AsyncSeriesWaterfallHook } from 'tapable';
import type * as TWebpack from 'webpack';
import type TWebpackDevServer from 'webpack-dev-server';
import {
  FileError,
  Import,
  IPackageJson,
  LegacyAdapters,
  PackageJsonLookup,
  Path
} from '@rushstack/node-core-library';
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
  IWebpackPluginAccessor,
  IWebpackVersions
} from './shared';
import { WebpackConfigurationLoader } from './WebpackConfigurationLoader';

/**
 * @public
 */
export const PLUGIN_NAME: string = 'WebpackPlugin';
const WEBPACK_DEV_SERVER_PACKAGE_NAME: string = 'webpack-dev-server';
const WEBPACK_DEV_SERVER_ENV_VAR_NAME: string = 'WEBPACK_DEV_SERVER';

/**
 * @internal
 */
export default class WebpackPlugin implements IHeftTaskPlugin {
  private _webpack: typeof TWebpack | undefined;
  private _webpackVersions: IWebpackVersions | undefined;
  private _loadedWebpackConfiguration: IWebpackConfiguration | null | undefined;

  public readonly accessor: IWebpackPluginAccessor = {
    onEmitWebpackVersionsHook: new AsyncParallelHook(['webpackVersions']),
    onConfigureWebpackHook: new AsyncSeriesWaterfallHook(['webpackConfiguration']),
    onAfterConfigureWebpackHook: new AsyncParallelHook(['webpackConfiguration']),
    onEmitStatsHook: new AsyncParallelHook(['webpackStats'])
  };

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    // These get set in the run hook and used in the onConfigureWebpackHook
    let production: boolean;
    let serveMode: boolean;
    let watchMode: boolean;

    this.accessor.onConfigureWebpackHook!.tapPromise(
      PLUGIN_NAME,
      async (existingConfiguration: IWebpackConfiguration | null) => {
        if (existingConfiguration) {
          taskSession.logger.terminal.writeVerboseLine(
            'Skipping loading webpack config file because the webpack config has already been set.'
          );
          return existingConfiguration;
        } else {
          const configurationLoader: WebpackConfigurationLoader = new WebpackConfigurationLoader(
            taskSession.logger,
            production,
            serveMode
          );
          return await configurationLoader.tryLoadWebpackConfigAsync(heftConfiguration.buildFolder);
        }
      }
    );

    taskSession.hooks.clean.tapPromise(PLUGIN_NAME, async (cleanOptions: IHeftTaskCleanHookOptions) => {
      // Obtain the finalized webpack configuration
      const webpackConfiguration: IWebpackConfiguration | null = await this._getWebpackConfigurationAsync();
      if (webpackConfiguration) {
        const webpackConfigurationArray: IWebpackConfigurationWithDevServer[] = Array.isArray(
          webpackConfiguration
        )
          ? webpackConfiguration
          : [webpackConfiguration];

        // Add each output path to the clean list
        for (const config of webpackConfigurationArray) {
          if (config.output?.path) {
            cleanOptions.addDeleteOperations({
              sourceFolder: config.output.path
            });
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
      const webpackConfiguration: IWebpackConfiguration | null = await this._getWebpackConfigurationAsync();
      await this._runWebpackAsync(taskSession, heftConfiguration, webpackConfiguration, serveMode, watchMode);
    });
  }

  private async _getWebpackAsync(): Promise<typeof TWebpack> {
    if (!this._webpack) {
      this._webpack = await import('webpack');
    }
    return this._webpack;
  }

  private async _getWebpackVersionsAsync(): Promise<IWebpackVersions> {
    if (!this._webpackVersions) {
      const webpackDevServerPackageJsonPath: string = Import.resolveModule({
        modulePath: 'webpack-dev-server/package.json',
        baseFolderPath: __dirname
      });
      const webpackDevServerPackageJson: IPackageJson = PackageJsonLookup.instance.loadPackageJson(
        webpackDevServerPackageJsonPath
      );
      const webpack: typeof TWebpack = await this._getWebpackAsync();
      this._webpackVersions = {
        webpackVersion: webpack.version!,
        webpackDevServerVersion: webpackDevServerPackageJson.version
      };
    }

    return this._webpackVersions;
  }

  private async _getWebpackConfigurationAsync(): Promise<IWebpackConfiguration | null> {
    if (this._webpackVersions === undefined || this._loadedWebpackConfiguration === undefined) {
      // First, load and emit the webpack versions so that plugins can use them when loading
      // their webpack configuration
      if (this.accessor.onEmitWebpackVersionsHook!.isUsed()) {
        this._webpackVersions = await this._getWebpackVersionsAsync();
        await this.accessor.onEmitWebpackVersionsHook!.promise(this._webpackVersions);
      }

      // Obtain the webpack configuration by calling into the hook. This hook is always used
      // since the WebpackPlugin itself taps the hook.
      const webpackConfiguration: IWebpackConfiguration | null =
        await this.accessor.onConfigureWebpackHook!.promise(undefined);

      // Provide the finalized configuration
      if (this.accessor.onAfterConfigureWebpackHook!.isUsed()) {
        await this.accessor.onAfterConfigureWebpackHook!.promise(webpackConfiguration);
      }

      this._loadedWebpackConfiguration = webpackConfiguration;
    }
    return this._loadedWebpackConfiguration;
  }

  private async _runWebpackAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    webpackConfiguration: IWebpackConfiguration | null,
    serveMode: boolean,
    watchMode: boolean
  ): Promise<void> {
    if (!webpackConfiguration) {
      return;
    }

    const logger: IScopedLogger = taskSession.logger;
    const webpack: typeof TWebpack = await this._getWebpackAsync();
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
      const originalBeforeCallback: typeof options.setupMiddlewares | undefined = options.setupMiddlewares;
      options.setupMiddlewares = (middlewares, devServer) => {
        compiler.hooks.done.tap('heft-webpack-plugin', () => {
          if (firstCompilationDoneCallback) {
            firstCompilationDoneCallback();
            firstCompilationDoneCallback = undefined;
          }
        });

        if (originalBeforeCallback) {
          return originalBeforeCallback(middlewares, devServer);
        }
        return middlewares;
      };

      // The webpack-dev-server package has a design flaw, where merely loading its package will set the
      // WEBPACK_DEV_SERVER environment variable -- even if no APIs are accessed. This environment variable
      // causes incorrect behavior if Heft is not running in serve mode. Thus, we need to be careful to call require()
      // only if Heft is in serve mode.
      const WebpackDevServer: typeof TWebpackDevServer = await import(WEBPACK_DEV_SERVER_PACKAGE_NAME);
      // TODO: the WebpackDevServer accepts a third parameter for a logger. We should make
      // use of that to make logging cleaner
      const webpackDevServer: TWebpackDevServer = new WebpackDevServer(options, compiler);

      await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        firstCompilationDoneCallback = resolve;

        // Wrap in promise.resolve due to small issue in the type declaration, return type should be
        // webpackDevServer.start(): Promise<void>;
        Promise.resolve(webpackDevServer.start()).catch(reject);
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
        if (this.accessor.onEmitStatsHook!.isUsed()) {
          await this.accessor.onEmitStatsHook!.promise(stats);
        }
        this._emitErrors(logger, heftConfiguration.buildFolder, stats);
      }
    }
  }

  private _emitErrors(
    logger: IScopedLogger,
    buildFolder: string,
    stats: TWebpack.Stats | TWebpack.MultiStats
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
    } else {
      let moduleName: string | undefined = error.moduleName;
      if (!moduleName && error.moduleIdentifier) {
        moduleName = Path.convertToSlashes(nodePath.relative(buildFolder, error.moduleIdentifier));
      }

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

      return moduleName
        ? new FileError(error.message, moduleName, lineNumber, columnNumber)
        : new Error(error.message);
    }
  }
}
