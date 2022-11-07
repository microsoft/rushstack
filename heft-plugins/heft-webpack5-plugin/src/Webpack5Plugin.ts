// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { AddressInfo } from 'net';
import type * as TWebpack from 'webpack';
import type TWebpackDevServer from 'webpack-dev-server';
import { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook } from 'tapable';
import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { FileError, InternalError, LegacyAdapters } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IScopedLogger,
  IHeftTaskRunIncrementalHookOptions
} from '@rushstack/heft';

import type { IWebpackConfiguration, IWebpackPluginAccessor } from './shared';
import { WebpackConfigurationLoader } from './WebpackConfigurationLoader';

type ExtendedCompiler = TWebpack.Compiler & { watching: TWebpack.Watching };
type ExtendedMultiCompiler = TWebpack.MultiCompiler & { compilers: ExtendedCompiler[] };

export interface IWebpackPluginOptions {
  devConfigurationPath: string | undefined;
  configurationPath: string | undefined;
}

/**
 * @public
 */
export const PLUGIN_NAME: 'webpack5-plugin' = 'webpack5-plugin';
const SERVE_PARAMETER_LONG_NAME: '--serve' = '--serve';
const WEBPACK_PACKAGE_NAME: 'webpack' = 'webpack';
const WEBPACK_DEV_SERVER_PACKAGE_NAME: 'webpack-dev-server' = 'webpack-dev-server';
const WEBPACK_DEV_SERVER_ENV_VAR_NAME: 'WEBPACK_DEV_SERVER' = 'WEBPACK_DEV_SERVER';
const WEBPACK_DEV_MIDDLEWARE_PACKAGE_NAME: 'webpack-dev-middleware' = 'webpack-dev-middleware';
const UNINITIALIZED: 'UNINITIALIZED' = 'UNINITIALIZED';

/**
 * @internal
 */
export default class Webpack5Plugin implements IHeftTaskPlugin<IWebpackPluginOptions> {
  private _serve: boolean = false;
  private _webpack: typeof TWebpack | undefined;
  private _webpackCompiler: ExtendedCompiler | ExtendedMultiCompiler | undefined;
  private _webpackConfiguration: IWebpackConfiguration | undefined | typeof UNINITIALIZED = UNINITIALIZED;
  private _webpackWatchers: TWebpack.Watching[] | undefined;
  private _webpackCompilationDonePromise: Promise<void> | undefined;
  private _webpackCompilationDonePromiseResolveFn: (() => void) | undefined;

  public readonly accessor: IWebpackPluginAccessor = {
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
    options: IWebpackPluginOptions
  ): void {
    this._serve = taskSession.parameters.getFlagParameter(SERVE_PARAMETER_LONG_NAME).value;
    if (!taskSession.parameters.watch && this._serve) {
      throw new Error(
        `The ${JSON.stringify(
          SERVE_PARAMETER_LONG_NAME
        )} parameter is only available when running in watch mode.`
      );
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runWebpackAsync(taskSession, heftConfiguration, options);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runWebpackWatchAsync(taskSession, heftConfiguration, options);
      }
    );
  }

  private async _getWebpackConfigurationAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions
  ): Promise<IWebpackConfiguration | undefined> {
    if (this._webpackConfiguration === UNINITIALIZED) {
      // Obtain the webpack configuration by calling into the hook. If undefined
      // is returned, load the default Webpack configuration.
      taskSession.logger.terminal.writeVerboseLine(
        'Attempting to load Webpack configuration via external plugins'
      );
      let webpackConfiguration: IWebpackConfiguration | false | undefined =
        await this.accessor.hooks.onLoadConfiguration.promise();
      if (webpackConfiguration === undefined) {
        taskSession.logger.terminal.writeVerboseLine('Attempt to load the default Webpack configuration');
        const configurationLoader: WebpackConfigurationLoader = new WebpackConfigurationLoader(
          taskSession.logger,
          taskSession.parameters.production,
          taskSession.parameters.watch && this._serve
        );
        webpackConfiguration = await configurationLoader.tryLoadWebpackConfigurationAsync({
          ...options,
          taskSession,
          heftConfiguration,
          loadWebpackAsyncFn: this._loadWebpackAsync.bind(this)
        });
      }

      if (webpackConfiguration === false) {
        taskSession.logger.terminal.writeLine('Webpack disabled by external plugin');
        this._webpackConfiguration = undefined;
      } else if (
        webpackConfiguration === undefined ||
        (Array.isArray(webpackConfiguration) && webpackConfiguration.length === 0)
      ) {
        taskSession.logger.terminal.writeLine('No Webpack configuration found');
        this._webpackConfiguration = undefined;
      } else {
        if (this.accessor.hooks.onConfigure.isUsed()) {
          // Allow for plugins to customise the configuration
          await this.accessor.hooks.onConfigure.promise(webpackConfiguration);
        }
        if (this.accessor.hooks.onAfterConfigure.isUsed()) {
          // Provide the finalized configuration
          await this.accessor.hooks.onAfterConfigure.promise(webpackConfiguration);
        }
        this._webpackConfiguration = webpackConfiguration;
      }
    }
    return this._webpackConfiguration;
  }

  private async _loadWebpackAsync(): Promise<typeof TWebpack> {
    if (!this._webpack) {
      // Allow this to fail if webpack is not installed
      this._webpack = await import(WEBPACK_PACKAGE_NAME);
    }
    return this._webpack!;
  }

  private async _getWebpackCompilerAsync(
    taskSession: IHeftTaskSession,
    webpackConfiguration: IWebpackConfiguration
  ): Promise<ExtendedCompiler | ExtendedMultiCompiler> {
    if (!this._webpackCompiler) {
      const webpack: typeof TWebpack = await this._loadWebpackAsync();
      taskSession.logger.terminal.writeLine(`Using Webpack version ${webpack.version}`);
      this._webpackCompiler = Array.isArray(webpackConfiguration)
        ? webpack.default(webpackConfiguration) /* (webpack.Compilation[]) => MultiCompiler */
        : webpack.default(webpackConfiguration); /* (webpack.Compilation) => Compiler */
    }
    return this._webpackCompiler;
  }

  private async _runWebpackAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions
  ): Promise<void> {
    this._validateEnvironmentVariable(taskSession);
    if (taskSession.parameters.watch || this._serve) {
      // Should never happen, but just in case
      throw new InternalError('Cannot run Webpack in compilation mode when watch mode is enabled');
    }

    // Load the config and compiler, and return if there is no config found
    const webpackConfiguration: IWebpackConfiguration | undefined = await this._getWebpackConfigurationAsync(
      taskSession,
      heftConfiguration,
      options
    );
    if (!webpackConfiguration) {
      return;
    }
    const compiler: ExtendedCompiler | ExtendedMultiCompiler = await this._getWebpackCompilerAsync(
      taskSession,
      webpackConfiguration
    );
    taskSession.logger.terminal.writeLine('Running Webpack compilation');

    // Run the webpack compiler
    let stats: TWebpack.Stats | TWebpack.MultiStats | undefined;
    try {
      stats = await LegacyAdapters.convertCallbackToPromise(
        (compiler as ExtendedCompiler).run.bind(compiler)
      );
      await LegacyAdapters.convertCallbackToPromise(compiler.close.bind(compiler));
    } catch (e) {
      taskSession.logger.emitError(e as Error);
    }

    // Emit the errors from the stats object, if present
    if (stats) {
      this._emitErrors(taskSession.logger, stats, heftConfiguration.buildFolderPath);
      if (this.accessor.hooks.onEmitStats.isUsed()) {
        await this.accessor.hooks.onEmitStats.promise(stats);
      }
    }
  }

  private async _runWebpackWatchAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions
  ): Promise<void> {
    // Save a handle to the original promise, since the this-scoped promise will be replaced whenever
    // the compilation completes.
    let webpackCompilationDonePromise: Promise<void> | undefined = this._webpackCompilationDonePromise;

    if (!this._webpackWatchers) {
      this._validateEnvironmentVariable(taskSession);
      if (!taskSession.parameters.watch) {
        // Should never happen, but just in case
        throw new InternalError('Cannot run Webpack in watch mode when compilation mode is enabled');
      }

      // Load the config and compiler, and return if there is no config found
      const webpackConfiguration: IWebpackConfiguration | undefined =
        await this._getWebpackConfigurationAsync(taskSession, heftConfiguration, options);
      if (!webpackConfiguration) {
        return;
      }

      // Get the compiler which will be used for both serve and watch mode
      const compiler: ExtendedCompiler | ExtendedMultiCompiler = await this._getWebpackCompilerAsync(
        taskSession,
        webpackConfiguration
      );

      // Set up the hook to detect when the watcher completes the watcher compilation. We will also log out
      // errors from the compilation if present from the output stats object.
      this._webpackCompilationDonePromise = new Promise((resolve: () => void) => {
        this._webpackCompilationDonePromiseResolveFn = resolve;
      });
      webpackCompilationDonePromise = this._webpackCompilationDonePromise;
      compiler.hooks.done.tap(PLUGIN_NAME, (stats?: TWebpack.Stats | TWebpack.MultiStats) => {
        this._webpackCompilationDonePromiseResolveFn!();
        this._webpackCompilationDonePromise = new Promise((resolve: () => void) => {
          this._webpackCompilationDonePromiseResolveFn = resolve;
        });
        if (stats) {
          this._emitErrors(taskSession.logger, stats, heftConfiguration.buildFolderPath);
        }
      });

      // Determine how we will run the compiler. When serving, we will run the compiler
      // via the webpack-dev-server. Otherwise, we will run the compiler directly.
      if (this._serve) {
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
          port: 8080,
          onListening: (server: TWebpackDevServer) => {
            const addressInfo: AddressInfo | string | undefined = server.server?.address() as AddressInfo;
            if (addressInfo) {
              const address: string =
                typeof addressInfo === 'string' ? addressInfo : `${addressInfo.address}:${addressInfo.port}`;
              taskSession.logger.terminal.writeLine(`Started Webpack Dev Server at https://${address}`);
            }
          }
        };

        // Obtain the devServerOptions from the webpack configuration, and combine with the default options
        let devServerOptions: TWebpackDevServer.Configuration;
        if (Array.isArray(webpackConfiguration)) {
          const filteredDevServerOptions: TWebpackDevServer.Configuration[] = webpackConfiguration
            .map((configuration) => configuration.devServer)
            .filter((devServer): devServer is TWebpackDevServer.Configuration => !!devServer);
          if (filteredDevServerOptions.length > 1) {
            taskSession.logger.emitWarning(
              new Error(`Detected multiple webpack devServer configurations, using the first one.`)
            );
          }
          devServerOptions = { ...defaultDevServerOptions, ...filteredDevServerOptions[0] };
        } else {
          devServerOptions = { ...defaultDevServerOptions, ...webpackConfiguration.devServer };
        }

        // Add the certificate and key to the devServerOptions if these fields don't already have values
        if (!devServerOptions.server) {
          const certificateManager: CertificateManager = new CertificateManager();
          const certificate: ICertificate = await certificateManager.ensureCertificateAsync(
            true,
            taskSession.logger.terminal
          );
          devServerOptions = {
            ...devServerOptions,
            server: {
              type: 'https',
              options: {
                key: certificate.pemKey,
                cert: certificate.pemCertificate
              }
            }
          };
        }

        // Since the webpack-dev-server does not return infrastructure errors via a callback like
        // compiler.watch(...), we will need to intercept them and log them ourselves.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        compiler.hooks.infrastructureLog.tap(PLUGIN_NAME, (name: string, type: string, args: any[]) => {
          if (name === WEBPACK_DEV_MIDDLEWARE_PACKAGE_NAME && type === 'error') {
            const error: Error | undefined = args[0];
            if (error) {
              taskSession.logger.emitError(error);
            }
          }
          return true;
        });

        // The webpack-dev-server package has a design flaw, where merely loading its package will set the
        // WEBPACK_DEV_SERVER environment variable -- even if no APIs are accessed. This environment variable
        // causes incorrect behavior if Heft is not running in serve mode. Thus, we need to be careful to call
        // require() only if Heft is in serve mode.
        taskSession.logger.terminal.writeLine('Starting webpack-dev-server');
        const WebpackDevServer: typeof TWebpackDevServer = (await import(WEBPACK_DEV_SERVER_PACKAGE_NAME))
          .default;
        const webpackDevServer: TWebpackDevServer = new WebpackDevServer(devServerOptions, compiler);
        await webpackDevServer.start();
      } else {
        // Create the watcher. Compilation will start immediately after invoking watch().
        taskSession.logger.terminal.writeLine('Starting Webpack watcher');
        compiler.watch({}, (error?: Error | null) => {
          if (error) {
            taskSession.logger.emitError(error);
          }
        });
      }

      // Store the watchers to be used for suspend/resume
      this._webpackWatchers = (
        (compiler as ExtendedMultiCompiler).compilers ?? [compiler as ExtendedCompiler]
      ).map((compiler: ExtendedCompiler) => compiler.watching);
    }

    // Resume the compilation, wait for the compilation to complete, then suspend the watchers until the
    // next iteration. Even if there are no changes, the promise should resolve since resuming from a
    // suspended state invalidates the state of the watcher.
    taskSession.logger.terminal.writeLine('Running incremental Webpack compilation');
    for (const watcher of this._webpackWatchers) {
      watcher.resume();
    }
    await webpackCompilationDonePromise;
    for (const watcher of this._webpackWatchers) {
      watcher.suspend();
    }
  }

  private _validateEnvironmentVariable(taskSession: IHeftTaskSession): void {
    if (!this._serve && process.env[WEBPACK_DEV_SERVER_ENV_VAR_NAME]) {
      taskSession.logger.emitWarning(
        new Error(
          `The "${WEBPACK_DEV_SERVER_ENV_VAR_NAME}" environment variable is set, ` +
            'which will cause problems when webpack is not running in serve mode. ' +
            `(Did a dependency inadvertently load the "${WEBPACK_DEV_SERVER_PACKAGE_NAME}" package?)`
        )
      );
    }
  }

  private _emitErrors(
    logger: IScopedLogger,
    stats: TWebpack.Stats | TWebpack.MultiStats,
    buildFolderPath: string
  ): void {
    if (stats.hasErrors() || stats.hasWarnings()) {
      const serializedStats: TWebpack.StatsCompilation = stats.toJson('errors-warnings');

      if (serializedStats.warnings) {
        for (const warning of serializedStats.warnings) {
          logger.emitWarning(this._normalizeError(buildFolderPath, warning));
        }
      }

      if (serializedStats.errors) {
        for (const error of serializedStats.errors) {
          logger.emitError(this._normalizeError(buildFolderPath, error));
        }
      }
    }
  }

  private _normalizeError(buildFolderPath: string, error: TWebpack.StatsError): Error {
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
        projectFolder: buildFolderPath,
        line: lineNumber,
        column: columnNumber
      });
    } else {
      return new Error(error.message);
    }
  }
}
