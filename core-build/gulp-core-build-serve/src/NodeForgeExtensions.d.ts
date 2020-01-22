// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IAttr {
  name: string;
  value: string;
}

interface IForgeCertificate {
  publicKey: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  validity: {
    notBefore: Date;
    notAfter: Date;
  };

  serialNumber: string;

  setSubject(attrs: IAttr[]): void;

  setIssuer(attrs: IAttr[]): void;

  setExtensions(extensions: any[]): void; // eslint-disable-line @typescript-eslint/no-explicit-any

  getExtension(extensionName: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any

  sign(privateKey: string, algorithm: IForgeSignatureAlgorithm): void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface IForgeSignatureAlgorithm {
}

interface IForgeExtensions {
  pki: {
    createCertificate(): IForgeCertificate;
    certificateToPem(certificate: IForgeCertificate): string;
    certificateFromPem(certificateData: string): IForgeCertificate;
  };

  md: {
    sha256: {
      create(): IForgeSignatureAlgorithm;
    }
  };
}