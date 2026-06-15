// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library/lib/PackageJsonLookup';

import { LFX_PACKAGE_ROOT } from '../constants';

describe('constants', () => {
  describe('lockfileExplorerProjectRoot', () => {
    it('should be a string', () => {
      const actualLockfileExplorerProjectRoot: string | undefined =
        PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
      expect(LFX_PACKAGE_ROOT).toBe(actualLockfileExplorerProjectRoot);
    });
  });
});
