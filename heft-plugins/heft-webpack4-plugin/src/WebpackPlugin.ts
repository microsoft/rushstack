// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  Compiler as WebpackCompiler,
  MultiCompiler as WebpackMultiCompiler,
  Stats as WebpackStats,
  compilation as WebpackCompilation
} from 'webpack';
import type TWebpackDevServer from 'webpack-dev-server';
import { LegacyAdapters, Import, IPackageJson, PackageJsonLookup } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IBuildStageProperties,
  IBundleSubstage,
  IHeftPlugin,
  ScopedLogger
} from '@rushstack/heft';
import type {
  IWebpackConfiguration,
  IWebpackBundleSubstageProperties,
  IWebpackBuildStageProperties
} from './shared';
import { WebpackConfigurationLoader } from './WebpackConfigurationLoader';

const webpack: typeof import('webpack') = Import.lazy('webpack', require);

const PLUGIN_NAME: string = 'WebpackPlugin';
const WEBPACK_DEV_SERVER_PACKAGE_NAME: string = 'webpack-dev-server';
const WEBPACK_DEV_SERVER_ENV_VAR_NAME: string = 'WEBPACK_DEV_SERVER';

interface IWebpackVersions {
  webpackVersion: string;
  webpackDevServerVersion: string;
}

/**
 * @internal
 */
export class WebpackPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  private static _webpackVersions: IWebpackVersions | undefined;
  private static _getWebpackVersions(): IWebpackVersions {
    if (!WebpackPlugin._webpackVersions) {
      const webpackDevServerPackageJsonPath: string = Import.resolveModule({
        modulePath: 'webpack-dev-server/package.json',
        baseFolderPath: __dirname
      });
      const webpackDevServerPackageJson: IPackageJson = PackageJsonLookup.instance.loadPackageJson(
        webpackDevServerPackageJsonPath
      );
      WebpackPlugin._webpackVersions = {
        webpackVersion: webpack.version!,
        webpackDevServerVersion: webpackDevServerPackageJson.version
      };
    }

    return WebpackPlugin._webpackVersions;
  }

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.configureWebpack.tap(
          { name: PLUGIN_NAME, stage: Number.MIN_SAFE_INTEGER },
          (webpackConfiguration: unknown) => {
            const webpackVersions: IWebpackVersions = WebpackPlugin._getWebpackVersions();
            bundle.properties.webpackVersion = webpack.version;
            bundle.properties.webpackDevServerVersion = webpackVersions.webpackDevServerVersion;

            return webpackConfiguration;
          }
        );

        bundle.hooks.configureWebpack.tapPromise(PLUGIN_NAME, async (existingConfiguration: unknown) => {
          const logger: ScopedLogger = heftSession.requestScopedLogger('configure-webpack');
          if (existingConfiguration) {
            logger.terminal.writeVerboseLine(
              'Skipping loading webpack config file because the webpack config has already been set.'
            );
            return existingConfiguration;
          } else {
            return await WebpackConfigurationLoader.tryLoadWebpackConfigAsync(
              logger,
              heftConfiguration.buildFolder,
              build.properties
            );
          }
        });

        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runWebpackAsync(
            heftSession,
            bundle.properties as IWebpackBundleSubstageProperties,
            build.properties,
            heftConfiguration.terminalProvider.supportsColor
          );
        });
      });
    });
  }

  private async _runWebpackAsync(
    heftSession: HeftSession,
    bundleSubstageProperties: IWebpackBundleSubstageProperties,
    buildProperties: IBuildStageProperties,
    supportsColor: boolean
  ): Promise<void> {
    const webpackConfiguration: IWebpackConfiguration | undefined | null =
      bundleSubstageProperties.webpackConfiguration;
    if (!webpackConfiguration) {
      return;
    }

    const logger: ScopedLogger = heftSession.requestScopedLogger('webpack');
    const webpackVersions: IWebpackVersions = WebpackPlugin._getWebpackVersions();
    if (bundleSubstageProperties.webpackVersion !== webpackVersions.webpackVersion) {
      logger.emitError(
        new Error(
          `The Webpack plugin expected to be configured with Webpack version ${webpackVersions.webpackVersion}, ` +
            `but the configuration specifies version ${bundleSubstageProperties.webpackVersion}. ` +
            'Are multiple versions of the Webpack plugin present?'
        )
      );
    }

    if (bundleSubstageProperties.webpackDevServerVersion !== webpackVersions.webpackDevServerVersion) {
      logger.emitError(
        new Error(
          `The Webpack plugin expected to be configured with webpack-dev-server version ${webpackVersions.webpackDevServerVersion}, ` +
            `but the configuration specifies version ${bundleSubstageProperties.webpackDevServerVersion}. ` +
            'Are multiple versions of the Webpack plugin present?'
        )
      );
    }

    logger.terminal.writeLine(`Using Webpack version ${webpack.version}`);

    const compiler: WebpackCompiler | WebpackMultiCompiler = Array.isArray(webpackConfiguration)
      ? webpack(webpackConfiguration) /* (webpack.Compilation[]) => webpack.MultiCompiler */
      : webpack(webpackConfiguration); /* (webpack.Compilation) => webpack.Compiler */

    if (buildProperties.serveMode) {
      const defaultDevServerOptions: TWebpackDevServer.Configuration = {
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
      const originalBeforeCallback: typeof options.before | undefined = options.before;
      options.before = (app, devServer, compiler: WebpackCompiler) => {
        compiler.hooks.done.tap('heft-webpack-plugin', () => {
          if (firstCompilationDoneCallback) {
            firstCompilationDoneCallback();
            firstCompilationDoneCallback = undefined;
          }
        });

        if (originalBeforeCallback) {
          return originalBeforeCallback(app, devServer, compiler);
        }
      };

      // The webpack-dev-server package has a design flaw, where merely loading its package will set the
      // WEBPACK_DEV_SERVER environment variable -- even if no APIs are accessed. This environment variable
      // causes incorrect behavior if Heft is not running in serve mode. Thus, we need to be careful to call require()
      // only if Heft is in serve mode.
      const WebpackDevServer: typeof TWebpackDevServer = require(WEBPACK_DEV_SERVER_PACKAGE_NAME);
      // TODO: the WebpackDevServer accepts a third parameter for a logger. We should make
      // use of that to make logging cleaner
      const webpackDevServer: TWebpackDevServer = new WebpackDevServer(compiler, options);
      await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        firstCompilationDoneCallback = resolve;

        webpackDevServer.listen(options.port!, options.host!, (error: Error | undefined) => {
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

      let stats: WebpackStats | WebpackCompilation.MultiStats | undefined;
      if (buildProperties.watchMode) {
        try {
          stats = await LegacyAdapters.convertCallbackToPromise(
            (compiler as WebpackCompiler).watch.bind(compiler),
            {}
          );
        } catch (e) {
          logger.emitError(e);
        }
      } else {
        try {
          stats = await LegacyAdapters.convertCallbackToPromise(
            (compiler as WebpackCompiler).run.bind(compiler)
          );
        } catch (e) {
          logger.emitError(e);
        }
      }

      if (stats) {
        // eslint-disable-next-line require-atomic-updates
        (buildProperties as IWebpackBuildStageProperties).webpackStats = stats;

        this._emitErrors(logger, stats);
      }
    }
  }

  private _emitErrors(logger: ScopedLogger, stats: WebpackStats | WebpackCompilation.MultiStats): void {
    if (stats.hasErrors() || stats.hasWarnings()) {
      const serializedStats: WebpackStats.ToJsonOutput = stats.toJson('errors-warnings');

      for (const warning of serializedStats.warnings as (string | Error)[]) {
        logger.emitWarning(warning instanceof Error ? warning : new Error(warning));
      }

      for (const error of serializedStats.errors as (string | Error)[]) {
        logger.emitError(error instanceof Error ? error : new Error(error));
      }
    }
  }
}
