// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin, IScopedLogger } from '@rushstack/heft';
import {
  PluginName as Webpack4PluginName,
  type IWebpackConfiguration as IWebpack4Configuration,
  type IWebpackConfigurationWithDevServer as IWebpack4ConfigurationWithDevServer,
  type IWebpackPluginAccessor as IWebpack4PluginAccessor,
  type IWebpackVersions as IWebpack4Versions
} from '@rushstack/heft-webpack4-plugin';
import {
  PluginName as Webpack5PluginName,
  type IWebpackConfiguration as IWebpack5Configuration,
  type IWebpackConfigurationWithDevServer as IWebpack5ConfigurationWithDevServer,
  type IWebpackPluginAccessor as IWebpack5PluginAccessor,
  type IWebpackVersions as IWebpack5Versions
} from '@rushstack/heft-webpack5-plugin';

const PLUGIN_NAME: string = 'ConfigureDevServerPlugin';

export default class ConfigureWebpackDevServerPlugin implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.requestAccessToPluginByName(
      '@rushstack/heft-webpack4-plugin',
      Webpack4PluginName,
      (accessor: IWebpack4PluginAccessor) => {
        let devServerVersion: number | undefined;

        accessor.onEmitWebpackVersionsHook!.tapPromise(
          PLUGIN_NAME,
          async (webpackVersions: IWebpack4Versions) => {
            devServerVersion = this._determineMajorVersion(webpackVersions.webpackDevServerVersion);
          }
        );

        accessor.onConfigureWebpackHook!.tapPromise(
          PLUGIN_NAME,
          async (webpackConfiguration: IWebpack4Configuration | null) => {
            const certificateManager: CertificateManager = new CertificateManager();
            await this._configureDevServerAsync(
              webpackConfiguration,
              certificateManager,
              taskSession.logger,
              devServerVersion
            );
            return webpackConfiguration;
          }
        );
      }
    );

    taskSession.requestAccessToPluginByName(
      '@rushstack/heft-webpack5-plugin',
      Webpack5PluginName,
      (accessor: IWebpack5PluginAccessor) => {
        let devServerVersion: number | undefined;

        accessor.onEmitWebpackVersionsHook!.tapPromise(
          PLUGIN_NAME,
          async (webpackVersions: IWebpack5Versions) => {
            devServerVersion = this._determineMajorVersion(webpackVersions.webpackDevServerVersion);
          }
        );

        accessor.onConfigureWebpackHook!.tapPromise(
          PLUGIN_NAME,
          async (webpackConfiguration: IWebpack5Configuration | null) => {
            const certificateManager: CertificateManager = new CertificateManager();
            await this._configureDevServerAsync(
              webpackConfiguration,
              certificateManager,
              taskSession.logger,
              devServerVersion
            );
            return webpackConfiguration;
          }
        );
      }
    );
  }

  private async _configureDevServerAsync(
    webpackConfiguration: IWebpack4Configuration | IWebpack5Configuration | null,
    certificateManager: CertificateManager,
    logger: IScopedLogger,
    webpackDevServerMajorVersion?: number
  ): Promise<void> {
    const certificate: ICertificate = await certificateManager.ensureCertificateAsync(true, logger.terminal);
    if (!webpackConfiguration) {
      logger.terminal.writeVerboseLine('No webpack configuration available to configure devServer.');
    } else {
      const configurations: (IWebpack4ConfigurationWithDevServer | IWebpack5ConfigurationWithDevServer)[] =
        Array.isArray(webpackConfiguration) ? webpackConfiguration : [webpackConfiguration];
      for (const configuration of configurations) {
        if (webpackDevServerMajorVersion && webpackDevServerMajorVersion === 4) {
          configuration.devServer = {
            ...configuration.devServer,
            server: {
              type: 'https',
              options: {
                key: certificate.pemKey,
                cert: certificate.pemCertificate
              }
            }
          };
        } else {
          configuration.devServer = {
            ...configuration.devServer,
            https: {
              key: certificate.pemKey,
              cert: certificate.pemCertificate
            }
          };
        }
      }
    }
  }

  private _determineMajorVersion(version?: string): number | undefined {
    if (version) {
      return parseInt(version);
    } else {
      return;
    }
  }
}
