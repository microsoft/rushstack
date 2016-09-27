import { GulpTask } from '@microsoft/gulp-core-build';
import * as gulp from 'gulp';

import { ensureCertificate, ICertificate } from './certificates';

/**
 * This task gnerates and trusts a development certificate. The certificate is self-signed
 *  and stored, along with its private key, in the user's home directory. On Windows, it's
 *  trusted as a root certification authority in the user certificate store. On macOS, it's
 *  trusted as a root cert in the keychain. On other platforms, the certificate is generated
 *  and signed, but the user must trust it manually.
 */
export default class TrustCertTask extends GulpTask<{}> {
  public name: string = 'trust-cert';

  public executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): void {
    const certificate: ICertificate = ensureCertificate(true, this);

    if (certificate.pemCertificate && certificate.pemKey) {
      completeCallback();
    } else {
      completeCallback('Error trusting development certificate.');
    }
  }
}
