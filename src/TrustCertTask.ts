import { GulpTask } from '@microsoft/gulp-core-build';
import * as gulp from 'gulp';

import { ensureCertificate, ICertificate } from './Certifiates';

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
