// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CertificateStore } from '../index';
import { CertificateManager } from '../CertificateManager';

test('Verify CertificateStore store is created.', () => {
  const certificateStore: CertificateStore = new CertificateStore();
  expect(certificateStore).toHaveProperty('certificateData');
  expect(certificateStore).toHaveProperty('keyData');
});

test('Verify CertificateManger provides ensure and untrust methods', () => {
  const certificateManger: CertificateManager = new CertificateManager();
  expect(certificateManger).toHaveProperty('ensureCertificate');
  expect(certificateManger).toHaveProperty('untrustCertificate');
});
