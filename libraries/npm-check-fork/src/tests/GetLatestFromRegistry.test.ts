// Mock the NpmRegistryClient before imports
jest.mock('../NpmRegistryClient');

import type { INpmRegistryInfo, INpmRegistryPackageResponse } from '../interfaces/INpmCheckRegistry';

describe('getNpmInfo', () => {
  let getNpmInfo: (packageName: string) => Promise<INpmRegistryInfo>;
  let mockFetchPackageMetadataAsync: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Re-require to get fresh module instances
    mockFetchPackageMetadataAsync = jest.fn();

    // Set up the mock implementation before importing getNpmInfo
    const mockNpmRegistryClient = jest.requireMock('../NpmRegistryClient');
    mockNpmRegistryClient.NpmRegistryClient.mockImplementation(() => ({
      fetchPackageMetadataAsync: mockFetchPackageMetadataAsync
    }));

    // Import the module under test
    const module = jest.requireActual('../GetLatestFromRegistry');
    getNpmInfo = module.default;
  });

  it('returns registry info with homepage', async () => {
    const mockData: INpmRegistryPackageResponse = {
      name: 'test-package',
      versions: {
        '1.0.0': {
          name: 'test-package',
          version: '1.0.0',
          homepage: 'https://homepage.com'
        },
        '2.0.0': {
          name: 'test-package',
          version: '2.0.0',
          bugs: { url: 'https://bugs.com' }
        }
      },
      'dist-tags': { latest: '1.0.0', next: '2.0.0' }
    };
    mockFetchPackageMetadataAsync.mockResolvedValue({ data: mockData });

    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    expect(result).toHaveProperty('latest', '1.0.0');
    expect(result).toHaveProperty('next', '2.0.0');
    expect(result).toHaveProperty('versions', ['1.0.0', '2.0.0']);
    expect(result).toHaveProperty('homepage', 'https://homepage.com');
  });

  it('returns error if fetch fails', async () => {
    mockFetchPackageMetadataAsync.mockResolvedValue({ error: 'Registry down' });

    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    expect(result).toHaveProperty('error');
    expect(result.error).toBe('Registry error Registry down');
  });

  it('returns "" homepage if not present', async () => {
    const mockData: INpmRegistryPackageResponse = {
      name: 'test-package',
      versions: {
        '1.0.0': {
          name: 'test-package',
          version: '1.0.0'
        },
        '2.0.0': {
          name: 'test-package',
          version: '2.0.0'
        }
      },
      'dist-tags': { latest: '1.0.0', next: '2.0.0' }
    };
    mockFetchPackageMetadataAsync.mockResolvedValue({ data: mockData });

    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    expect(result).toHaveProperty('homepage', '');
  });

  it('filters out versions exceeding CRAZY_HIGH_SEMVER threshold', async () => {
    const mockData: INpmRegistryPackageResponse = {
      name: 'test-package',
      versions: {
        '1.0.0': {
          name: 'test-package',
          version: '1.0.0'
        },
        '2.0.0': {
          name: 'test-package',
          version: '2.0.0'
        },
        '9000.0.0': {
          name: 'test-package',
          version: '9000.0.0'
        }
      },
      'dist-tags': { latest: '2.0.0', next: '2.0.0' }
    };
    mockFetchPackageMetadataAsync.mockResolvedValue({ data: mockData });

    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    // Versions exceeding 8000.0.0 should be filtered out
    expect(result.versions).toEqual(['1.0.0', '2.0.0']);
    expect(result.versions).not.toContain('9000.0.0');
  });
});
