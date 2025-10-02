// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../CreatePackageSummary', () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));

jest.mock('../GetUnusedPackages', () => ({
  __esModule: true,
  default: jest.fn(async (state) => {
    if (state.skipUnused) {
      return state;
    }
    state.unusedDependencies = ['mock-unused'];
    state.missingFromPackageJson = { 'mock-missing': ['index.js'] };
    return state;
  })
}));

import createPackageSummary from '../CreatePackageSummary';
const mockCreatePackageSummary = createPackageSummary as jest.MockedFunction<typeof createPackageSummary>;

import type { INpmCheckState } from '../interfaces/INpmCheck';
import LocalNpmCheck from '../LocalNpmCheck';

describe('NpmCheck', () => {
  it('should set unusedDependencies, missingFromPackageJson, and package summaries', async () => {
    mockCreatePackageSummary.mockImplementation(async (moduleName) => ({
      moduleName,
      homepage: '',
      latest: '',
      installed: '',
      isInstalled: false,
      notInstalled: true,
      packageWanted: '',
      packageJson: '',
      notInPackageJson: undefined,
      devDependency: false,
      peerDependency: false,
      usedInScripts: [],
      mismatch: false,
      semverValid: '',
      easyUpgrade: false,
      bump: undefined,
      unused: false
    }));
    const result: INpmCheckState = await LocalNpmCheck();
    expect(result.unusedDependencies).toStrictEqual(['mock-unused']);
    expect(result.missingFromPackageJson).toStrictEqual({ 'mock-missing': ['index.js'] });
    expect(result.packages).toBeDefined();
    if (result.packages && result.packages.length > 0) {
      expect(result.packages[0]).toHaveProperty('moduleName');
    }
  });

  it('should mimic rush initial options', async () => {
    mockCreatePackageSummary.mockImplementation(async (moduleName) => ({
      moduleName,
      homepage: '',
      latest: '',
      installed: '',
      isInstalled: false,
      notInstalled: true,
      packageWanted: '',
      packageJson: '',
      notInPackageJson: undefined,
      devDependency: false,
      peerDependency: false,
      usedInScripts: [],
      mismatch: false,
      semverValid: '',
      easyUpgrade: false,
      bump: undefined,
      unused: false
    }));
    const result: INpmCheckState = await LocalNpmCheck({
      cwd: process.cwd(),
      skipUnused: true
    });
    expect(result.unusedDependencies).toBeFalsy();
    expect(result.missingFromPackageJson).toStrictEqual({});
    expect(result.packages).toBeDefined();
    if (result.packages && result.packages.length > 0) {
      expect(result.packages[0]).toHaveProperty('moduleName');
    }
  });
});
