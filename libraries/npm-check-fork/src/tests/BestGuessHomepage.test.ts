// Mock gitUrl.parse
jest.mock('giturl', () => ({ parse: (url: string) => url }));

import bestGuessHomepage from '../BestGuessHomepage.ts';
import type { INpmCheckRegistryData } from '../interfaces/INpmCheckRegistry.ts';

describe('bestGuessHomepage', () => {
  it('returns false if data is undefined', () => {
    expect(bestGuessHomepage(undefined)).toBe(false);
  });

  it('returns homepage if present', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          homepage: 'https://homepage.com'
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://homepage.com');
  });

  it('returns bugs.url if homepage is missing', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          bugs: { url: 'https://bugs.com' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://bugs.com');
  });

  it('returns repository.url if homepage and bugs.url are missing', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          repository: { url: 'https://repo.com' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://repo.com');
  });

  it('returns false if no homepage, bugs.url, or repository.url', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {}
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe(false);
  });
});
