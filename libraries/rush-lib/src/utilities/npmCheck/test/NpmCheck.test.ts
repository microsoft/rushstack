// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../CreatePackageSummary', () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));

import createPackageSummary from '../CreatePackageSummary';
const mockCreatePackageSummary = createPackageSummary as jest.MockedFunction<typeof createPackageSummary>;

import type { INpmCheckState } from '../interfaces/INpmCheck';
import LocalNpmCheck from '../LocalNpmCheck';

describe('NpmCheck', () => {
  it('should mimic rush initial options', async () => {
    mockCreatePackageSummary.mockImplementation(async (moduleName) => ({
      moduleName,
      homepage: '',
      latest: '',
      installed: '',
      notInstalled: true,
      packageWanted: '',
      packageJson: '',
      notInPackageJson: undefined,
      devDependency: false,
      peerDependency: false,
      mismatch: false,
      bump: undefined
    }));
    const result: INpmCheckState = await LocalNpmCheck({
      cwd: process.cwd()
    });
    expect(result.packages).toBeDefined();
    if (result.packages && result.packages.length > 0) {
      expect(result.packages[0]).toHaveProperty('moduleName');
    }
  });
});
