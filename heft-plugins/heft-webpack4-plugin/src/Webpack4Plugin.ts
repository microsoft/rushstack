// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { AddressInfo } from 'node:net';
import type * as TWebpack from 'webpack';
import type TWebpackDevServer from 'webpack-dev-server';
import { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook, type SyncBailHook } from 'tapable';
import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { InternalError, LegacyAdapters } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IScopedLogger,
  IHeftTaskRunIncrementalHookOptions
} from '@rushstack/heft';

import {
  PLUGIN_NAME,
  type IWebpackConfiguration,
  type IWebpackPluginAccessor,
  type IWebpackPluginAccessorHooks
} from './shared';
import { tryLoadWebpackConfigurationAsync } from './WebpackConfigurationLoader';
import {
  type DeferredWatchFileSystem,
  type IWatchFileSystem,
  OverrideNodeWatchFSPlugin
} from './DeferredWatchFileSystem';

type ExtendedWatching = TWebpack.Watching & {
  resume: () => void;
  suspend: () => void;
};

type ExtendedMultiWatching = TWebpack.MultiWatching & {
  resume: () => void;
  suspend: () => void;
};

type ExtendedCompiler = TWebpack.Compiler & {
  hooks: TWebpack.Compiler['hooks'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    infrastructureLog: SyncBailHook<string, string, any[]>;
  };
  watching: ExtendedWatching;
  watchFileSystem: IWatchFileSystem;
};

type ExtendedMultiCompiler = TWebpack.MultiCompiler & {
  compilers: ExtendedCompiler[];
  hooks: TWebpack.MultiCompiler['hooks'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    infrastructureLog: SyncBailHook<string, string, any[]>;
  };
  watching: ExtendedMultiWatching;
};

export interface IWebpackPluginOptions {
  devConfigurationPath?: string | undefined;
  configurationPath?: string | undefined;
}

const SERVE_PARAMETER_LONG_NAME: '--serve' = '--serve';
const WEBPACK_PACKAGE_NAME: 'webpack' = 'webpack';
const WEBPACK_DEV_SERVER_PACKAGE_NAME: 'webpack-dev-server' = 'webpack-dev-server';
const WEBPACK_DEV_SERVER_ENV_VAR_NAME: 'WEBPACK_DEV_SERVER' = 'WEBPACK_DEV_SERVER';
const WEBPACK_DEV_MIDDLEWARE_PACKAGE_NAME: 'webpack-dev-middleware' = 'webpack-dev-middleware';

/**
 * @internal
 */
export default class Webpack4Plugin implements IHeftTaskPlugin<IWebpackPluginOptions> {
  private _accessor: IWebpackPluginAccessor | undefined;
  private _isServeMode: boolean = false;
  private _webpack: typeof TWebpack | undefined;
  private _webpackCompiler: ExtendedCompiler | ExtendedMultiCompiler | undefined;
  private _webpackConfiguration: IWebpackConfiguration | undefined | false = false;
  private _webpackCompilationDonePromise: Promise<void> | undefined;
  private _webpackCompilationDonePromiseResolveFn: (() => void) | undefined;
  private _watchFileSystems: Set<DeferredWatchFileSystem> | undefined;

  private _warnings: Error[] = [];
  private _errors: Error[] = [];

  public get accessor(): IWebpackPluginAccessor {
    if (!this._accessor) {
      this._accessor = {
        hooks: _createAccessorHooks(),
        parameters: {
          isServeMode: this._isServeMode
        }
      };
    }
    return this._accessor;
  }

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions = {}
  ): void {
    this._isServeMode = taskSession.parameters.getFlagParameter(SERVE_PARAMETER_LONG_NAME).value;
    if (!taskSession.parameters.watch && this._isServeMode) {
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
        await this._runWebpackWatchAsync(taskSession, heftConfiguration, options, runOptions.requestRun);
      }
    );
  }

  private async _getWebpackConfigurationAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions,
    requestRun?: () => void
  ): Promise<IWebpackConfiguration | undefined> {
    if (this._webpackConfiguration === false) {
      const webpackConfiguration: IWebpackConfiguration | undefined = await tryLoadWebpackConfigurationAsync(
        {
          taskSession,
          heftConfiguration,
          hooks: this.accessor.hooks,
          serveMode: this._isServeMode,
          loadWebpackAsyncFn: this._loadWebpackAsync.bind(this)
        },
        options
      );

      if (webpackConfiguration && requestRun) {
        const overrideWatchFSPlugin: OverrideNodeWatchFSPlugin = new OverrideNodeWatchFSPlugin(requestRun);
        this._watchFileSystems = overrideWatchFSPlugin.fileSystems;
        for (const config of Array.isArray(webpackConfiguration)
          ? webpackConfiguration
          : [webpackConfiguration]) {
          if (!config.plugins) {
            config.plugins = [overrideWatchFSPlugin];
          } else {
            config.plugins.unshift(overrideWatchFSPlugin);
          }
        }
      }

      this._webpackConfiguration = webpackConfiguration;
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
        ? (webpack.default(
            webpackConfiguration
          ) as ExtendedMultiCompiler) /* (webpack.Compilation[]) => MultiCompiler */
        : (webpack.default(webpackConfiguration) as ExtendedCompiler); /* (webpack.Compilation) => Compiler */
    }
    return this._webpackCompiler;
  }

  private async _runWebpackAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions
  ): Promise<void> {
    this._validateEnvironmentVariable(taskSession);
    if (taskSession.parameters.watch || this._isServeMode) {
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
        (compiler as TWebpack.Compiler).run.bind(compiler)
      );
    } catch (e) {
      taskSession.logger.emitError(e as Error);
    }

    // Emit the errors from the stats object, if present
    if (stats) {
      this._recordErrors(stats);
      if (this.accessor.hooks.onEmitStats.isUsed()) {
        await this.accessor.hooks.onEmitStats.promise(stats);
      }
      this._emitErrors(taskSession.logger);
    }
  }

  private async _runWebpackWatchAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IWebpackPluginOptions,
    requestRun: () => void
  ): Promise<void> {
    // Save a handle to the original promise, since the this-scoped promise will be replaced whenever
    // the compilation completes.
    let webpackCompilationDonePromise: Promise<void> | undefined = this._webpackCompilationDonePromise;

    let isInitial: boolean = false;

    if (!this._webpackCompiler) {
      isInitial = true;
      this._validateEnvironmentVariable(taskSession);
      if (!taskSession.parameters.watch) {
        // Should never happen, but just in case
        throw new InternalError('Cannot run Webpack in watch mode when compilation mode is enabled');
      }

      // Load the config and compiler, and return if there is no config found
      const webpackConfiguration: IWebpackConfiguration | undefined =
        await this._getWebpackConfigurationAsync(taskSession, heftConfiguration, options, requestRun);
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
          this._recordErrors(stats);
        }
      });

      // Determine how we will run the compiler. When serving, we will run the compiler
      // via the webpack-dev-server. Otherwise, we will run the compiler directly.
      if (this._isServeMode) {
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
            logging: 'info',
            webSocketURL: {
              port: 8080
            }
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

          // Update the web socket URL to use the hostname provided by the certificate
          const clientConfiguration: TWebpackDevServer.Configuration['client'] = devServerOptions.client;
          const hostname: string | undefined = certificate.subjectAltNames?.[0];
          if (hostname && typeof clientConfiguration === 'object') {
            const { webSocketURL } = clientConfiguration;
            if (typeof webSocketURL === 'object') {
              clientConfiguration.webSocketURL = {
                ...webSocketURL,
                hostname
              };
            }
          }

          devServerOptions = {
            ...devServerOptions,
            server: {
              type: 'https',
              options: {
                minVersion: 'TLSv1.3',
                key: certificate.pemKey,
                cert: certificate.pemCertificate,
                ca: certificate.pemCaCertificate
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
    }

    let hasChanges: boolean = true;
    if (!isInitial && this._watchFileSystems) {
      hasChanges = false;
      for (const watchFileSystem of this._watchFileSystems) {
        hasChanges = watchFileSystem.flush() || hasChanges;
      }
    }

    // Resume the compilation, wait for the compilation to complete, then suspend the watchers until the
    // next iteration. Even if there are no changes, the promise should resolve since resuming from a
    // suspended state invalidates the state of the watcher.
    if (hasChanges) {
      taskSession.logger.terminal.writeLine('Running incremental Webpack compilation');
      await webpackCompilationDonePromise;
    } else {
      taskSession.logger.terminal.writeLine(
        'Webpack has not detected changes. Listing previous diagnostics.'
      );
    }

    this._emitErrors(taskSession.logger);
  }

  private _validateEnvironmentVariable(taskSession: IHeftTaskSession): void {
    if (!this._isServeMode && process.env[WEBPACK_DEV_SERVER_ENV_VAR_NAME]) {
      taskSession.logger.emitWarning(
        new Error(
          `The "${WEBPACK_DEV_SERVER_ENV_VAR_NAME}" environment variable is set, ` +
            'which will cause problems when webpack is not running in serve mode. ' +
            `(Did a dependency inadvertently load the "${WEBPACK_DEV_SERVER_PACKAGE_NAME}" package?)`
        )
      );
    }
  }

  private _emitErrors(logger: IScopedLogger): void {
    for (const warning of this._warnings) {
      logger.emitWarning(warning);
    }
    for (const error of this._errors) {
      logger.emitError(error);
    }
  }

  private _recordErrors(stats: TWebpack.Stats | TWebpack.compilation.MultiStats): void {
    this._errors.length = 0;
    this._warnings.length = 0;

    if (stats.hasErrors() || stats.hasWarnings()) {
      const serializedStats: TWebpack.Stats.ToJsonOutput[] = [stats.toJson('errors-warnings')];

      for (const compilationStats of serializedStats) {
        for (const warning of compilationStats.warnings as (string | Error)[]) {
          this._warnings.push(warning instanceof Error ? warning : new Error(warning));
        }

        for (const error of compilationStats.errors as (string | Error)[]) {
          this._errors.push(error instanceof Error ? error : new Error(error));
        }

        if (compilationStats.children) {
          for (const child of compilationStats.children) {
            serializedStats.push(child);
          }
        }
      }
    }
  }
}

/**
 * @internal
 */
export function _createAccessorHooks(): IWebpackPluginAccessorHooks {
  return {
    onLoadConfiguration: new AsyncSeriesBailHook(),
    onConfigure: new AsyncSeriesHook(['webpackConfiguration']),
    onAfterConfigure: new AsyncParallelHook(['webpackConfiguration']),
    onEmitStats: new AsyncParallelHook(['webpackStats'])
  };
}
