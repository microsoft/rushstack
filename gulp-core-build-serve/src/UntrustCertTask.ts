import { GulpTask } from '@microsoft/gulp-core-build';
import * as gulp from 'gulp';

import CertificateStore from './CertificateStore';
import { untrustCertificate } from './certificates';

/**
 * On Windows, this task removes the certificate with the expected serial number from the user's
 *  root certification authorities list. On macOS, it finds the SHA signature of the certificate
 *  with the expected serial number and then removes that certificate from the keychain. On
 *  other platforms, the user must untrust the certificate manually. On all platforms,
 *  the certificate and private key are deleted from the user's home directory.
 */
export default class UntrustCertTask extends GulpTask<{}> {
  public name: string = 'untrust-cert';

  public executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): void {
    const untrustCertResult: boolean = untrustCertificate(this);
    const certificateStore: CertificateStore = CertificateStore.instance;

    // Clear out the certificate store
    certificateStore.certificateData = undefined;
    certificateStore.keyData = undefined;

    if (untrustCertResult) {
      completeCallback();
    } else {
      completeCallback('Error untrusting certificate.');
    }
  }
}
