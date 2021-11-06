// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IBundleSubstage,
  IHeftPlugin,
  IScopedLogger
} from '@rushstack/heft';
import { CertificateManager } from '@rushstack/debug-certificate-manager';

const PLUGIN_NAME: string = 'DevCertPlugin';

export class DevCertPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  /**
   * Ensure a developer certificate exists and is configured to be used by webpack-dev-server in serve mode.
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const logger: IScopedLogger = heftSession.requestScopedLogger(PLUGIN_NAME);
    const certificateManager: CertificateManager = new CertificateManager();

    heftSession.registerAction<undefined>({
      actionName: 'trust-dev-cert',
      documentation: 'Creates and trusts a local development certificate for serving localhost',
      callback: async () => {
        try {
          await certificateManager.ensureCertificateAsync(true, logger.terminal);
          logger.terminal.writeLine('Done.');
        } catch (err) {
          logger.emitError(new Error(`Unable to generate or trust development certificate. Error: ${err}`));
        }
      }
    });

    heftSession.registerAction<undefined>({
      actionName: 'untrust-dev-cert',
      documentation: 'Untrusts the local development certificate for localhost',
      callback: async () => {
        try {
          await certificateManager.untrustCertificateAsync(logger.terminal);
          logger.terminal.writeLine('Done.');
        } catch (err) {
          logger.emitError(new Error(`Unable to untrust development certificate. Error: ${err}`));
        }
      }
    });

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundleSubstage: IBundleSubstage) => {
        if (build.properties.serveMode) {
          bundleSubstage.hooks.afterConfigureWebpack.tapPromise(PLUGIN_NAME, async (conf: unknown) => {
            logger.terminal.writeLine('Main config: ', String(conf));
            const webpackConfiguration = bundleSubstage.properties.webpackConfiguration;
            logger.terminal.writeLine('Alt config: ', String(webpackConfiguration));
            await this._configureDevServerAsync(webpackConfiguration);
          });
        }
      });
    });
  }

  private async _configureDevServerAsync(webpackConfiguration: unknown): Promise<void> {
    // Do something
  }
}
