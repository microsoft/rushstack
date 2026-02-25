// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();

import { createHash } from 'node:crypto';

import { runTests } from './LocalizedRuntimeTestBase.ts';

runTests({
  hashFunction: (contents) => createHash('sha256').update(contents).digest('hex')
});
