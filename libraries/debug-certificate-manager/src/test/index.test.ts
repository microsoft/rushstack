// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CertificateStore } from '../index';

test('Verify CertificateStore singleton is created.', () => {
  const certificateStore: CertificateStore = new CertificateStore();
  expect(certificateStore).toHaveProperty('certificateData');
  expect(certificateStore).toHaveProperty('keyData');
});
