const forge = require('node-forge'); // tslint:disable-line:typedef
import * as fs from 'fs';
import * as path from 'path';

import * as child_process from 'child_process';
import { EOL } from 'os';

export function CreateCert(): void {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;

  const now: Date = new Date();

  cert.validity.notBefore = now;
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5); // Five years from now

  const attrs = [{
    name: 'commonName',
    value: 'localhost'
  }];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true
    }, {
      name: 'friendlyName',
      value: 'gulp-core-build-serve Development Certificate'
    }]);

  // self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // convert a Forge certificate to PEM
  const pem: string = forge.pki.certificateToPem(cert);
  const privateKey: string = forge.pki.privateKeyToPem(keys.privateKey);

  const certName: string = now.getTime().toString();
  const tempDirName: string = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDirName)) {
    fs.mkdirSync(tempDirName); // Create the temp dir if it doesn't exist
  }

  const tempCertPath: string = path.join(tempDirName, `${certName}.cer`);
  fs.writeFileSync(tempCertPath, pem);
  fs.writeFileSync(path.join(tempDirName, `${certName}.key`), privateKey);

  if (process.platform === 'win32') {
    const where: child_process.SpawnSyncReturns<string> = child_process.spawnSync('where', ['certutil']);

    const whereErr: string = where.stderr.toString();
    if (!!whereErr) {
      console.error(`Error finding certUtil command: "${whereErr}"`);
    } else {
      const certUtilExePath: string = where.stdout.toString().trim();

      const returns: child_process.SpawnSyncReturns<string> =
        child_process.spawnSync(certUtilExePath, ['-user', '-addstore', 'root', tempCertPath]);

      if (returns.status !== 0) {
        const errorLines: string[] = returns.stdout.toString().split(EOL).map((line: string) => line.trim());
        if (returns.status === 2147943623 || // Not sure if this is always the status code for "cancelled"
            errorLines[errorLines.length - 1].indexOf('The operation was canceled by the user.') > 0) {
          // 2147943623
          console.log('Certificate trust cancelled.');
        } else {
          console.log('Certificate trust failed with an unknown error.');
        }
      } else {
        console.log('Successfully trusted development certificate.');
      }
    }
  } else {
    // Not implemented yet
  }
}