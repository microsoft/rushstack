jest.mock('package-json');

import getNpmInfo from '../GetLatestFromRegistry';
import packageJson from 'package-json';
import type { INpmRegistryInfo } from '../interfaces/INpmCheckRegistry';

const mockPackageJson = packageJson as jest.MockedFunction<typeof packageJson>;

describe('getNpmInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns registry info with homepage', async () => {
    mockPackageJson.mockResolvedValue({
      versions: {
        '1.0.0': {
          homepage: 'https://homepage.com'
        },
        '2.0.0': {
          bugs: { url: 'https://bugs.com' }
        }
      },
      'dist-tags': { latest: '1.0.0', next: '2.0.0' }
    } as unknown as packageJson.FullMetadata);
    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    expect(result).toHaveProperty('latest', '1.0.0');
    expect(result).toHaveProperty('next', '2.0.0');
    expect(result).toHaveProperty('versions', ['1.0.0', '2.0.0']);
    expect(result).toHaveProperty('homepage', 'https://homepage.com');
  });

  it('returns error if packageJson throws', async () => {
    mockPackageJson.mockRejectedValue(new Error('Registry down'));
    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    expect(result).toHaveProperty('error');
    expect(result.error).toBe('Registry error Registry down');
  });

  it('returns "" homepage if not present', async () => {
    mockPackageJson.mockResolvedValue({
      versions: {
        '1.0.0': {},
        '2.0.0': {}
      },
      'dist-tags': { latest: '1.0.0', next: '2.0.0' }
    } as unknown as packageJson.FullMetadata);
    const result: INpmRegistryInfo = await getNpmInfo('test-package');
    expect(result).toHaveProperty('homepage', '');
  });
});
