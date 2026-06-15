// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Vendored from \@pnpm/dependency-path\@900.0.0 (pnpm v9.15.9).
// https://github.com/pnpm/pnpm/blob/d22a3f65ee047ecee7c89dd6f1971ecea4ecd4d4/packages/dependency-path/src/index.ts

import { createDepPathToFilename } from './common';
import { createBase32Hash } from './hash';

export const depPathToFilename: (depPath: string) => string = createDepPathToFilename({
  specialCharsRegex: /[\\/:*?"<>|]/g,
  maxLengthWithoutHash: 120 - 26 - 1,
  hashFn: createBase32Hash
});
