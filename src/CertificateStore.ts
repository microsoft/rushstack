import * as path from 'path';
import * as fs from 'fs';

const encoding: string = 'utf8';

export default class CertificateStore {
  private static _instance: CertificateStore;

  public static get instance(): CertificateStore {
    if (!CertificateStore._instance) {
      CertificateStore._instance = new CertificateStore();
      CertificateStore._instance._initialize();
    }

    return CertificateStore._instance;
  }

  private _userProfilePath: string;
  private _gcbServeDataPath: string;
  private _certificatePath: string;
  private _certificate: string;

  public get certificate(): string {
    if (!this._certificate) {
      if (fs.existsSync(this._certificatePath)) {
        this._certificate = fs.readFileSync(this._certificatePath, 'utf8');
      } else {
        return undefined;
      }
    }

    return this._certificate;
  }

  public set certificate(certificate: string) {
    if (certificate) {
      fs.writeFileSync(this._certificatePath, certificate, { encoding });
    } else if (fs.existsSync(this._certificatePath)) {
      fs.unlinkSync(this._certificatePath);
    }

    this._certificate = certificate;
  }

  private _initialize(): void {
    const unresolvedUserFolder: string = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    this._userProfilePath = path.resolve(unresolvedUserFolder);
    if (!fs.existsSync(this._userProfilePath)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._gcbServeDataPath = path.join(this._userProfilePath, '.gcb-serve-data');
    if (!fs.existsSync(this._gcbServeDataPath)) {
      fs.mkdirSync(this._gcbServeDataPath);
    }

    this._certificatePath = path.join(this._gcbServeDataPath, 'gcb-serve.p12');
  }
}
