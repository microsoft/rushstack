// Mock the NpmRegistryClient before imports
jest.mock('../NpmRegistryClient');

import getNpmInfo from '../GetLatestFromRegistry';
import { NpmRegistryClient } from '../NpmRegistryClient';
import type { INpmRegistryInfo, INpmRegistryPackageResponse } from '../interfaces/INpmCheckRegistry';

const MockedNpmRegistryClient = NpmRegistryClient as jest.MockedClass<typeof NpmRegistryClient>;

describe('getNpmInfo', () => {
  let mockFetchPackageMetadataAsync: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchPackageMetadataAsync = jest.fn();
    MockedNpmRegistryClient.mockImplementation(
      () =>
        ({
          fetchPackageMetadataAsync: mockFetchPackageMetadataAsync
        }) as unknown as NpmRegistryClient
    );
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
});
