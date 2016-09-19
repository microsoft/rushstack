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
  private _certificate: Buffer;

  private _certificatePem: string;
  private _certificatePemKey: string;

  public get certificate(): Buffer {
    if (!this._certificate) {
      if (fs.existsSync(this._certificatePath)) {
        this._certificate = fs.readFileSync(this._certificatePath);
      } else {
        return undefined;
      }
    }

    return this._certificate;
  }

  public set certificate(certificate: Buffer) {
    if (certificate) {
      fs.writeFileSync(this._certificatePath, certificate);
    } else if (fs.existsSync(this._certificatePath)) {
      fs.unlinkSync(this._certificatePath);
    }

    this._certificate = certificate;
  }

  public get certificatePem(): string {
    return this._certificatePem;
  }

  public get certificatePemKey(): string {
    return this._certificatePemKey;
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
