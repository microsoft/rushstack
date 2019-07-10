// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from '@microsoft/gulp-core-build';
import * as Gulp from 'gulp';
import { ICertificate, ensureCertificate } from './certificates';

/**
 * This task generates and trusts a development certificate. The certificate is self-signed
 *  and stored, along with its private key, in the user's home directory. On Windows, it's
 *  trusted as a root certification authority in the user certificate store. On macOS, it's
 *  trusted as a root cert in the keychain. On other platforms, the certificate is generated
 *  and signed, but the user must trust it manually.
 */
export class TrustCertTask extends GulpTask<void> {
  constructor() {
    super('trust-cert');
  }

  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): void {
    const certificate: ICertificate = ensureCertificate(true, this);

    if (certificate.pemCertificate && certificate.pemKey) {
      completeCallback();
    } else {
      completeCallback('Error trusting development certificate.');
    }
  }
}
