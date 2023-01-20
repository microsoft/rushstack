// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CertificateManager } from '@rushstack/debug-certificate-manager';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';

const PLUGIN_NAME: 'trust-dev-certificate-plugin' = 'trust-dev-certificate-plugin';

export default class TrustDevCertificatePlugin implements IHeftTaskPlugin {
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const { logger } = taskSession;
      const certificateManager: CertificateManager = new CertificateManager();

      try {
        await certificateManager.ensureCertificateAsync(
          /* canGenerateNewCertificate: */ true,
          logger.terminal
        );
        logger.terminal.writeLine('Certificate successfully trusted.');
      } catch (err) {
        logger.emitError(new Error(`Unable to generate or trust development certificate. Error: ${err}`));
      }
    });
  }
}
