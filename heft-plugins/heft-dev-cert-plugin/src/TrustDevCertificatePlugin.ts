// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CertificateManager } from '@rushstack/debug-certificate-manager';
import type {
  HeftConfiguration,
  HeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';

const PLUGIN_NAME: string = 'TrustDevCertPlugin';

export default class TrustDevCertificatePlugin implements IHeftTaskPlugin {
  private _pluginName: string;
  private _trustDevCert: boolean;

  public constructor(pluginName: string = PLUGIN_NAME, trustDevCert: boolean = true) {
    this._pluginName = pluginName;
    this._trustDevCert = trustDevCert;
  }

  public apply(taskSession: HeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.run.tapPromise(this._pluginName, async (runOptions: IHeftTaskRunHookOptions) => {
      const { logger } = taskSession;
      const certificateManager: CertificateManager = new CertificateManager();

      if (this._trustDevCert) {
        try {
          await certificateManager.ensureCertificateAsync(
            /* canGenerateNewCertificate: */ true,
            logger.terminal
          );
          logger.terminal.writeLine('Done.');
        } catch (err) {
          logger.emitError(new Error(`Unable to generate or trust development certificate. Error: ${err}`));
        }
      } else {
        try {
          await certificateManager.untrustCertificateAsync(logger.terminal);
          logger.terminal.writeLine('Done.');
        } catch (err) {
          logger.emitError(new Error(`Unable to untrust development certificate. Error: ${err}`));
        }
      }
    });
  }
}
