// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Based on \@pnpm/dependency-path\@2.1.8 (pnpm v8.15.9).
// https://github.com/pnpm/pnpm/blob/afe8ecef1f24812845b699c141d52643d1524079/packages/dependency-path/src/index.ts
//
// NOTE: The original pnpm source's depPathToFilenameUnescaped uses lastIndexOf('/')
// to find the version separator. This works for pnpm's internal dep paths which use '/'
// before the version (e.g. /@babel/code-frame/7.24.2), but NOT for lockfile v6 keys
// which use '@' (e.g. /@babel/code-frame@7.24.2). For scoped packages, lastIndexOf('/')
// would find the scope separator and produce @babel@code-frame@7.24.2 instead of the
// correct @babel+code-frame@7.24.2 (where the scope '/' is replaced by '+' via regex).
//
// We use the shared depPathToFilenameUnescaped (indexOf('@', 1)) from common.ts which
// correctly handles lockfile key format. The hash algorithm and special-char regex are
// identical to pnpm 9.

import { createDepPathToFilename } from './common';
import { createBase32Hash } from './hash';

export const depPathToFilename: (depPath: string) => string = createDepPathToFilename({
  specialCharsRegex: /[\\/:*?"<>|]/g,
  maxLengthWithoutHash: 120 - 26 - 1,
  hashFn: createBase32Hash
});
