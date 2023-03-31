jest.mock('node-fetch', function () {
  return Object.assign(jest.fn(), jest.requireActual('node-fetch'));
});

import fetch, { Response } from 'node-fetch';
import { HttpBuildCacheProvider } from './HttpBuildCacheProvider';
import { RushSession, EnvironmentConfiguration } from '@rushstack/rush-sdk';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';

const EXAMPLE_OPTIONS = {
  url: 'https://buildcache.example.acme.com',
  tokenHandler: {
    exec: 'node',
    args: ['tokenHandler.js']
  },
  uploadMethod: 'POST',
  isCacheWriteAllowed: false,
  pluginName: 'example-plugin',
  rushProjectRoot: '/repo'
};

describe('HttpBuildCacheProvider', () => {
  let terminalBuffer: StringBufferTerminalProvider;
  let terminal!: Terminal;

  beforeEach(() => {
    terminalBuffer = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalBuffer);
  });

  describe('tryGetCacheEntryBufferByIdAsync', () => {
    it('prints warning if read credentials are not available', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);

      mocked(fetch).mockResolvedValue(
        new Response('Unauthorized', {
          status: 401,
          statusText: 'Unauthorized'
        })
      );

      const result = await provider.tryGetCacheEntryBufferByIdAsync(terminal, 'some-key');
      expect(result).toBe(undefined);
      expect(fetch).toHaveBeenCalledWith('https://buildcache.example.acme.com/some-key', {
        body: undefined,
        headers: {},
        method: 'GET',
        redirect: 'follow'
      });
      expect(terminalBuffer.getWarningOutput()).toEqual(
        'Error getting cache entry: Error: Credentials for https://buildcache.example.acme.com/ have not been provided.[n]In CI, verify that RUSH_BUILD_CACHE_CREDENTIAL contains a valid Authorization header value.[n][n]For local developers, run:[n][n]    rush update-cloud-credentials --interactive[n][n]'
      );
    });
  });
});
