import { GulpTask } from '@microsoft/gulp-core-build';
import * as gulp from 'gulp';

import CertificateStore from './CertificateStore';
import { untrustCertificate } from './Certifiates';

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
