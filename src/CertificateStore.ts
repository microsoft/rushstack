import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

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
  private _keyPath: string;

  private _certificateData: string;
  private _keyData: string;

  public get certificatePath(): string {
    return this._certificatePath;
  }

  public get certificateData(): string {
    if (!this._certificateData) {
      if (fs.existsSync(this._certificatePath)) {
        this._certificateData = fs.readFileSync(this._certificatePath, encoding);
      } else {
        return undefined;
      }
    }

    return this._certificateData;
  }

  public set certificateData(certificate: string) {
    if (certificate) {
      fs.writeFileSync(this._certificatePath, certificate);
    } else if (fs.existsSync(this._certificatePath)) {
      fs.unlinkSync(this._certificatePath);
    }

    this._certificateData = certificate;
  }

  public get keyData(): string {
    if (!this._keyData) {
      if (fs.existsSync(this._keyPath)) {
        this._keyData = fs.readFileSync(this._keyPath, encoding);
      } else {
        return undefined;
      }
    }

    return this._keyData;
  }

  public set keyData(key: string) {
    if (key) {
      fs.writeFileSync(this._keyPath, key, { encoding });
    } else if (fs.existsSync(this._keyPath)) {
      fs.unlinkSync(this._keyPath);
    }

    this._keyData = key;
  }

  private _initialize(): void {
    const unresolvedUserFolder: string = homedir();
    this._userProfilePath = path.resolve(unresolvedUserFolder);
    if (!fs.existsSync(this._userProfilePath)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._gcbServeDataPath = path.join(this._userProfilePath, '.gcb-serve-data');
    if (!fs.existsSync(this._gcbServeDataPath)) {
      fs.mkdirSync(this._gcbServeDataPath);
    }

    this._certificatePath = path.join(this._gcbServeDataPath, 'gcb-serve.cer');
    this._keyPath = path.join(this._gcbServeDataPath, 'gcb-serve.key');
  }
}
