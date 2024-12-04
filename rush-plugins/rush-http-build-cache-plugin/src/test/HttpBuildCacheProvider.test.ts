// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node-fetch', function () {
  return Object.assign(jest.fn(), jest.requireActual('node-fetch'));
});

import fetch, { Response } from 'node-fetch';
import { type RushSession, EnvironmentConfiguration } from '@rushstack/rush-sdk';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { HttpBuildCacheProvider, type IHttpBuildCacheProviderOptions } from '../HttpBuildCacheProvider';

const EXAMPLE_OPTIONS: IHttpBuildCacheProviderOptions = {
  url: 'https://buildcache.example.acme.com',
  tokenHandler: {
    exec: 'node',
    args: ['tokenHandler.js']
  },
  uploadMethod: 'POST',
  isCacheWriteAllowed: false,
  pluginName: 'example-plugin',
  rushJsonFolder: '/repo',
  minHttpRetryDelayMs: 1
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
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenNthCalledWith(1, 'https://buildcache.example.acme.com/some-key', {
        body: undefined,
        headers: {},
        method: 'GET',
        redirect: 'follow'
      });
      expect(terminalBuffer.getWarningOutput()).toMatchInlineSnapshot(
        `"Error getting cache entry: Error: Credentials for https://buildcache.example.acme.com/ have not been provided.[n]In CI, verify that RUSH_BUILD_CACHE_CREDENTIAL contains a valid Authorization header value.[n][n]For local developers, run:[n][n]    rush update-cloud-credentials --interactive[n][n]"`
      );
    });

    it('attempts up to 3 times to download a cache entry', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);

      mocked(fetch).mockResolvedValueOnce(
        new Response('InternalServiceError', {
          status: 500,
          statusText: 'InternalServiceError'
        })
      );
      mocked(fetch).mockResolvedValueOnce(
        new Response('ServiceUnavailable', {
          status: 503,
          statusText: 'ServiceUnavailable'
        })
      );
      mocked(fetch).mockResolvedValueOnce(
        new Response('BadGateway', {
          status: 504,
          statusText: 'BadGateway'
        })
      );

      const result = await provider.tryGetCacheEntryBufferByIdAsync(terminal, 'some-key');
      expect(result).toBe(undefined);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(1, 'https://buildcache.example.acme.com/some-key', {
        body: undefined,
        headers: {},
        method: 'GET',
        redirect: 'follow'
      });
      expect(fetch).toHaveBeenNthCalledWith(2, 'https://buildcache.example.acme.com/some-key', {
        body: undefined,
        headers: {},
        method: 'GET',
        redirect: 'follow'
      });
      expect(fetch).toHaveBeenNthCalledWith(3, 'https://buildcache.example.acme.com/some-key', {
        body: undefined,
        headers: {},
        method: 'GET',
        redirect: 'follow'
      });
      expect(terminalBuffer.getWarningOutput()).toMatchInlineSnapshot(
        `"Could not get cache entry: HTTP 504: BadGateway[n]"`
      );
    });
  });
});
