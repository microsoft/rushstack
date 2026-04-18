// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import bestGuessHomepage from '../BestGuessHomepage';
import type { INpmCheckRegistryData } from '../interfaces/INpmCheckRegistry';

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
          bugs: { url: 'https://bugs.com/issues' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://bugs.com/issues');
  });

  it('returns repository.url if homepage and bugs.url are missing', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          repository: { url: 'https://repo.com/user/proj' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://repo.com/user/proj');
  });

  it('converts git@ SCP-style repository URL to https', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          repository: { url: 'git@github.com:user/repo.git' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://github.com/user/repo');
  });

  it('converts git:// repository URL to https', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          repository: { url: 'git://github.com/user/repo.git' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://github.com/user/repo');
  });

  it('converts git+https:// repository URL to https', () => {
    const data: INpmCheckRegistryData = {
      versions: {
        latest: {
          repository: { url: 'git+https://github.com/user/repo.git' }
        }
      },
      'dist-tags': { latest: 'latest' }
    };
    expect(bestGuessHomepage(data)).toBe('https://github.com/user/repo');
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
