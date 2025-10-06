// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../GetLatestFromRegistry');
jest.mock('../ReadPackageJson');
jest.mock('../FindModulePath');

import createPackageSummary from '../CreatePackageSummary';
import getLatestFromRegistry from '../GetLatestFromRegistry';
import readPackageJson from '../ReadPackageJson';
import findModulePath from '../FindModulePath';
import type { INpmCheckPackageJson, INpmCheckState } from '../interfaces/INpmCheck';
import type { INpmRegistryInfo } from '../interfaces/INpmCheckRegistry';
import type { INpmCheckPackageSummary } from '../interfaces/INpmCheckPackageSummary';

const mockGetLatestFromRegistry = getLatestFromRegistry as jest.MockedFunction<typeof getLatestFromRegistry>;
const mockReadPackageJson = readPackageJson as jest.MockedFunction<typeof readPackageJson>;
const mockFindModulePath = findModulePath as jest.MockedFunction<typeof findModulePath>;

describe('createPackageSummary', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns false for private package', async () => {
    mockFindModulePath.mockReturnValue('/mock/path/private-pkg');
    mockReadPackageJson.mockReturnValue({
      dependencies: {},
      devDependencies: {},
      private: true
    } as INpmCheckPackageJson);
    const state: INpmCheckState = {
      cwd: process.cwd(),
      cwdPackageJson: { dependencies: {}, devDependencies: {} }
    };
    const result: INpmCheckPackageSummary | boolean = await createPackageSummary('private-pkg', state);
    expect(result).toBe(false);
  });

  it('returns false for invalid semver range', async () => {
    mockFindModulePath.mockReturnValue('/mock/path');
    mockReadPackageJson.mockReturnValue({
      dependencies: {},
      devDependencies: {}
    } as INpmCheckPackageJson);
    const state: INpmCheckState = {
      cwd: process.cwd(),
      cwdPackageJson: {
        dependencies: { 'bad-pkg': 'github:foo/bar' },
        devDependencies: {}
      }
    };
    const result: INpmCheckPackageSummary | boolean = await createPackageSummary('bad-pkg', state);
    expect(result).toBe(false);
  });

  it('returns summary for valid package', async () => {
    mockFindModulePath.mockReturnValue('/mock/path');
    mockReadPackageJson.mockReturnValue({
      dependencies: {},
      devDependencies: {}
    } as INpmCheckPackageJson);
    mockGetLatestFromRegistry.mockResolvedValue({
      latest: '2.0.0',
      next: '3.0.0',
      versions: ['1.0.0', '2.0.0', '3.0.0'],
      homepage: 'https://homepage.com'
    } as INpmRegistryInfo);
    const state: INpmCheckState = {
      cwd: process.cwd(),
      cwdPackageJson: { dependencies: { 'good-pkg': '1.0.0' }, devDependencies: {} },
      unusedDependencies: ['good-pkg'],
      missingFromPackageJson: {}
    } as INpmCheckState;
    const result: INpmCheckPackageSummary | boolean = await createPackageSummary('good-pkg', state);
    expect(result).toBeTruthy();
    expect(result).toHaveProperty('moduleName', 'good-pkg');
    expect(result).toHaveProperty('homepage', 'https://homepage.com');
    expect(result).toHaveProperty('latest', '2.0.0');
    expect(result).toHaveProperty('installed', '1.0.0');
  });
});
