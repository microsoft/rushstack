// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@rushstack/node-core-library';

export const EXPECTED_OUTPUT: string =
  'ESM import test PASSED: @rushstack/node-core-library resolved correctly under Node.js ESM.';

// If this line runs without ERR_MODULE_NOT_FOUND, the exports map is working correctly.
const result: string = Path.convertToSlashes('foo\\bar');
if (result !== 'foo/bar') {
  throw new Error('Unexpected result from Path.convertToSlashes: ' + result);
}

// eslint-disable-next-line no-console
console.log(EXPECTED_OUTPUT);
