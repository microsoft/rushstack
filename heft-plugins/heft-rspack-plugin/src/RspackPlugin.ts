// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { AddressInfo } from 'node:net';

import type * as TRspack from '@rspack/core';
import type * as TRspackDevServer from '@rspack/dev-server';
import { AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';

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

import {
  type IRspackConfiguration,
  type IRspackPluginAccessor,
  PLUGIN_NAME,
  type IRspackPluginAccessorHooks,
  type RspackCoreImport
} from './shared';
import { tryLoadRspackConfigurationAsync } from './RspackConfigurationLoader';

export interface IRspackPluginOptions {
  devConfigurationPath?: string | undefined;
  configurationPath?: string | undefined;
}
const SERVE_PARAMETER_LONG_NAME: '--serve' = '--serve';
const RSPACK_PACKAGE_NAME: '@rspack/core' = '@rspack/core';
const RSPACK_DEV_SERVER_PACKAGE_NAME: '@rspack/dev-server' = '@rspack/dev-server';
const RSPACK_DEV_SERVER_ENV_VAR_NAME: 'RSPACK_DEV_SERVER' = 'RSPACK_DEV_SERVER';
const WEBPACK_DEV_MIDDLEWARE_PACKAGE_NAME: 'webpack-dev-middleware' = 'webpack-dev-middleware';

/**
 * @internal
 */
export default class RspackPlugin implements IHeftTaskPlugin<IRspackPluginOptions> {
  private _accessor: IRspackPluginAccessor | undefined;
  private _isServeMode: boolean = false;
  private _rspack: RspackCoreImport | undefined;
  private _rspackCompiler: TRspack.Compiler | TRspack.MultiCompiler | undefined;
  private _rspackConfiguration: IRspackConfiguration | undefined | false = false;
  private _rspackCompilationDonePromise: Promise<void> | undefined;
  private _rspackCompilationDonePromiseResolveFn: (() => void) | undefined;

  private _warnings: Error[] = [];
  private _errors: Error[] = [];

  public get accessor(): IRspackPluginAccessor {
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
    options: IRspackPluginOptions = {}
  ): void {
    this._isServeMode = taskSession.parameters.getFlagParameter(SERVE_PARAMETER_LONG_NAME).value;
    if (this._isServeMode && !taskSession.parameters.watch) {
      throw new Error(
        `The ${JSON.stringify(
          SERVE_PARAMETER_LONG_NAME
        )} parameter is only available when running in watch mode.` +
          ` Try replacing "${taskSession.parsedCommandLine?.unaliasedCommandName}" with` +
          ` "${taskSession.parsedCommandLine?.unaliasedCommandName}-watch" in your Heft command line.`
      );
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runRspackAsync(taskSession, heftConfiguration, options);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runRspackWatchAsync(taskSession, heftConfiguration, options, runOptions.requestRun);
      }
    );
  }

  private async _getRspackConfigurationAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IRspackPluginOptions,
    requestRun?: () => void
  ): Promise<IRspackConfiguration | undefined> {
    if (this._rspackConfiguration === false) {
      const rspackConfiguration: IRspackConfiguration | undefined = await tryLoadRspackConfigurationAsync(
        {
          taskSession,
          heftConfiguration,
          hooks: this.accessor.hooks,
          serveMode: this._isServeMode,
          loadRspackAsyncFn: this._loadRspackAsync.bind(this)
        },
        options
      );

      this._rspackConfiguration = rspackConfiguration;
    }

    return this._rspackConfiguration;
  }

  private async _loadRspackAsync(): Promise<RspackCoreImport> {
    if (!this._rspack) {
      // Allow this to fail if Rspack is not installed
      this._rspack = await import(RSPACK_PACKAGE_NAME);
    }
    return this._rspack!;
  }

  private async _getRspackCompilerAsync(
    taskSession: IHeftTaskSession,
    rspackConfiguration: IRspackConfiguration
  ): Promise<TRspack.Compiler | TRspack.MultiCompiler> {
    if (!this._rspackCompiler) {
      const rspack: RspackCoreImport = await this._loadRspackAsync();
      taskSession.logger.terminal.writeLine(`Using Rspack version ${rspack.version}`);
      this._rspackCompiler = Array.isArray(rspackConfiguration)
        ? rspack.default(rspackConfiguration) /* (rspack.Compilation[]) => MultiCompiler */
        : rspack.default(rspackConfiguration); /* (rspack.Compilation) => Compiler */
    }
    return this._rspackCompiler;
  }

  private async _runRspackAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IRspackPluginOptions
  ): Promise<void> {
    this._validateEnvironmentVariable(taskSession);
    if (taskSession.parameters.watch || this._isServeMode) {
      // Should never happen, but just in case
      throw new InternalError('Cannot run Rspack in compilation mode when watch mode is enabled');
    }

    // Load the config and compiler, and return if there is no config found
    const rspackConfiguration: IRspackConfiguration | undefined = await this._getRspackConfigurationAsync(
      taskSession,
      heftConfiguration,
      options
    );
    if (!rspackConfiguration) {
      return;
    }
    const compiler: TRspack.Compiler | TRspack.MultiCompiler = await this._getRspackCompilerAsync(
      taskSession,
      rspackConfiguration
    );
    taskSession.logger.terminal.writeLine('Running Rspack compilation');

    // Run the rspack compiler
    let stats: TRspack.Stats | TRspack.MultiStats | undefined;
    try {
      stats = await LegacyAdapters.convertCallbackToPromise(
        (compiler as TRspack.Compiler).run.bind(compiler)
      );
      await LegacyAdapters.convertCallbackToPromise(compiler.close.bind(compiler));
    } catch (e) {
      taskSession.logger.emitError(e as Error);
    }

    // Emit the errors from the stats object, if present
    if (stats) {
      this._recordErrors(stats, heftConfiguration.buildFolderPath);
      this._emitErrors(taskSession.logger);
      if (this.accessor.hooks.onEmitStats.isUsed()) {
        await this.accessor.hooks.onEmitStats.promise(stats);
      }
    }
  }

  private async _runRspackWatchAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IRspackPluginOptions,
    requestRun: () => void
  ): Promise<void> {
    // Save a handle to the original promise, since the this-scoped promise will be replaced whenever
    // the compilation completes.
    let rspackCompilationDonePromise: Promise<void> | undefined = this._rspackCompilationDonePromise;

    if (!this._rspackCompiler) {
      this._validateEnvironmentVariable(taskSession);
      if (!taskSession.parameters.watch) {
        // Should never happen, but just in case
        throw new InternalError('Cannot run Rspack in watch mode when compilation mode is enabled');
      }

      // Load the config and compiler, and return if there is no config found
      const rspackConfiguration: IRspackConfiguration | undefined = await this._getRspackConfigurationAsync(
        taskSession,
        heftConfiguration,
        options,
        requestRun
      );
      if (!rspackConfiguration) {
        return;
      }

      // Get the compiler which will be used for both serve and watch mode
      const compiler: TRspack.Compiler | TRspack.MultiCompiler = await this._getRspackCompilerAsync(
        taskSession,
        rspackConfiguration
      );

      // Set up the hook to detect when the watcher completes the watcher compilation. We will also log out
      // errors from the compilation if present from the output stats object.
      this._rspackCompilationDonePromise = new Promise((resolve: () => void) => {
        this._rspackCompilationDonePromiseResolveFn = resolve;
      });
      rspackCompilationDonePromise = this._rspackCompilationDonePromise;
      compiler.hooks.done.tap(PLUGIN_NAME, (stats?: TRspack.Stats | TRspack.MultiStats) => {
        this._rspackCompilationDonePromiseResolveFn!();
        this._rspackCompilationDonePromise = new Promise((resolve: () => void) => {
          this._rspackCompilationDonePromiseResolveFn = resolve;
        });

        if (stats) {
          this._recordErrors(stats, heftConfiguration.buildFolderPath);
        }
      });

      // Determine how we will run the compiler. When serving, we will run the compiler
      // via the @rspack/dev-server. Otherwise, we will run the compiler directly.
      if (this._isServeMode) {
        const defaultDevServerOptions: TRspackDevServer.Configuration = {
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
          watchFiles: [],
          static: [],
          port: 8080,
          onListening: (server: TRspackDevServer.RspackDevServer) => {
            const addressInfo: AddressInfo | string | undefined = server.server?.address() as AddressInfo;
            if (addressInfo) {
              let url: string;
              if (typeof addressInfo === 'string') {
                url = addressInfo;
              } else {
                const address: string =
                  addressInfo.family === 'IPv6'
                    ? `[${addressInfo.address}]:${addressInfo.port}`
                    : `${addressInfo.address}:${addressInfo.port}`;
                url = `https://${address}/`;
              }
              taskSession.logger.terminal.writeLine(`Started Rspack Dev Server at ${url}`);
            }
          }
        };

        // Obtain the devServerOptions from the rspack configuration, and combine with the default options
        let devServerOptions: TRspackDevServer.Configuration;
        if (Array.isArray(rspackConfiguration)) {
          const filteredDevServerOptions: TRspackDevServer.Configuration[] = rspackConfiguration
            .map((configuration) => configuration.devServer)
            .filter((devServer): devServer is TRspackDevServer.Configuration => !!devServer);
          if (filteredDevServerOptions.length > 1) {
            taskSession.logger.emitWarning(
              new Error(`Detected multiple rspack devServer configurations, using the first one.`)
            );
          }
          devServerOptions = { ...defaultDevServerOptions, ...filteredDevServerOptions[0] };
        } else {
          devServerOptions = { ...defaultDevServerOptions, ...rspackConfiguration.devServer };
        }

        // Add the certificate and key to the devServerOptions if these fields don't already have values
        if (!devServerOptions.server) {
          const certificateManager: CertificateManager = new CertificateManager();
          const certificate: ICertificate = await certificateManager.ensureCertificateAsync(
            true,
            taskSession.logger.terminal
          );

          // Update the web socket URL to use the hostname provided by the certificate
          const clientConfiguration: TRspackDevServer.Configuration['client'] = devServerOptions.client;
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
        compiler.hooks.infrastructureLog.tap(
          PLUGIN_NAME,
          (name: string, type: string, args: unknown[] | undefined) => {
            if (name === WEBPACK_DEV_MIDDLEWARE_PACKAGE_NAME && type === 'error') {
              const error: Error | undefined = args?.[0] as Error | undefined;
              if (error) {
                taskSession.logger.emitError(error);
              }
            }
            return true;
          }
        );

        // The webpack-dev-server package has a design flaw, where merely loading its package will set the
        // WEBPACK_DEV_SERVER environment variable -- even if no APIs are accessed. This environment variable
        // causes incorrect behavior if Heft is not running in serve mode. Thus, we need to be careful to call
        // require() only if Heft is in serve mode.
        taskSession.logger.terminal.writeLine('Starting rspack-dev-server');
        const RspackDevServer: typeof TRspackDevServer.RspackDevServer = (
          await import(RSPACK_DEV_SERVER_PACKAGE_NAME)
        ).RspackDevServer;
        const rspackDevServer: TRspackDevServer.RspackDevServer = new RspackDevServer(
          devServerOptions,
          compiler
        );
        await rspackDevServer.start();
      } else {
        // Create the watcher. Compilation will start immediately after invoking watch().
        taskSession.logger.terminal.writeLine('Starting Rspack watcher');

        const { onGetWatchOptions } = this.accessor.hooks;

        const watchOptions:
          | Parameters<TRspack.Compiler['watch']>[0]
          | Parameters<TRspack.MultiCompiler['watch']>[0] = onGetWatchOptions.isUsed()
          ? await onGetWatchOptions.promise({}, rspackConfiguration)
          : {};

        (compiler as TRspack.Compiler).watch(watchOptions, (error?: Error | null) => {
          if (error) {
            taskSession.logger.emitError(error);
          }
        });
      }
    }

    // Resume the compilation, wait for the compilation to complete, then suspend the watchers until the
    // next iteration. Even if there are no changes, the promise should resolve since resuming from a
    // suspended state invalidates the state of the watcher.
    await rspackCompilationDonePromise;

    this._emitErrors(taskSession.logger);
  }

  private _validateEnvironmentVariable(taskSession: IHeftTaskSession): void {
    if (!this._isServeMode && process.env[RSPACK_DEV_SERVER_ENV_VAR_NAME]) {
      taskSession.logger.emitWarning(
        new Error(
          `The "${RSPACK_DEV_SERVER_ENV_VAR_NAME}" environment variable is set, ` +
            'which will cause problems when rspack is not running in serve mode. ' +
            `(Did a dependency inadvertently load the "${RSPACK_DEV_SERVER_PACKAGE_NAME}" package?)`
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

  private _recordErrors(stats: TRspack.Stats | TRspack.MultiStats, buildFolderPath: string): void {
    const errors: Error[] = this._errors;
    const warnings: Error[] = this._warnings;

    errors.length = 0;
    warnings.length = 0;

    if (stats.hasErrors() || stats.hasWarnings()) {
      const serializedStats: TRspack.StatsCompilation[] = [stats.toJson('errors-warnings')];

      for (const compilationStats of serializedStats) {
        if (compilationStats.warnings) {
          for (const warning of compilationStats.warnings) {
            warnings.push(this._normalizeError(buildFolderPath, warning));
          }
        }

        if (compilationStats.errors) {
          for (const error of compilationStats.errors) {
            errors.push(this._normalizeError(buildFolderPath, error));
          }
        }

        if (compilationStats.children) {
          for (const child of compilationStats.children) {
            serializedStats.push(child);
          }
        }
      }
    }
  }

  private _normalizeError(buildFolderPath: string, error: TRspack.StatsError): Error {
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

/**
 * @internal
 */
export function _createAccessorHooks(): IRspackPluginAccessorHooks {
  return {
    onLoadConfiguration: new AsyncSeriesBailHook(),
    onConfigure: new AsyncSeriesHook(['rspackConfiguration']),
    onAfterConfigure: new AsyncParallelHook(['rspackConfiguration']),
    onEmitStats: new AsyncParallelHook(['rspackStats']),
    onGetWatchOptions: new AsyncSeriesWaterfallHook(['watchOptions', 'rspackConfiguration'])
  };
}
