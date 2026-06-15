// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Vendored from \@pnpm/dependency-path\@1000.0.1 (pnpm v10.0.0).
// https://github.com/pnpm/pnpm/blob/42ecf04fd0e442af8610ae4231855e004732dbf7/packages/dependency-path/src/index.ts

import { createDepPathToFilename } from './common';
import { createShortSha256Hash } from './hash';

export const depPathToFilename: (depPath: string) => string = createDepPathToFilename({
  specialCharsRegex: /[\\/:*?"<>|#]/g,
  maxLengthWithoutHash: 120 - 32 - 1,
  hashFn: createShortSha256Hash
});
