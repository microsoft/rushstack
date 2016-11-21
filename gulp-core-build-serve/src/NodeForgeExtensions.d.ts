interface IAttr {
  name: string;
  value: string;
}

interface IForgeCertificate {
  publicKey: any; // tslint:disable-line:no-any

  validity: {
    notBefore: Date;
    notAfter: Date;
  };

  serialNumber: string;

  setSubject(attrs: IAttr[]): void;

  setIssuer(attrs: IAttr[]): void;

  setExtensions(extensions: any[]): void; // tslint:disable-line:no-any

  sign(privateKey: string, algorithm: IForgeSignatureAlgorithm): void;
}

interface IForgeSignatureAlgorithm {
}

interface IForgeExtensions {
  pki: {
    createCertificate(): IForgeCertificate;
    certificateToPem(certificate: IForgeCertificate): string;
  };

  md: {
    sha256: {
      create(): IForgeSignatureAlgorithm;
    }
  };
}