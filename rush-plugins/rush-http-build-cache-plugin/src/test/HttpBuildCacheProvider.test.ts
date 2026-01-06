// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/rush-sdk/lib/utilities/WebClient', () => {
  return jest.requireActual('@microsoft/rush-lib/lib/utilities/WebClient');
});

import { type RushSession, EnvironmentConfiguration } from '@rushstack/rush-sdk';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { WebClient } from '@rushstack/rush-sdk/lib/utilities/WebClient';

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

type FetchFnType = Parameters<typeof WebClient.mockRequestFn>[0];

describe('HttpBuildCacheProvider', () => {
  let terminalBuffer: StringBufferTerminalProvider;
  let terminal!: Terminal;
  let fetchFn: jest.Mock;

  beforeEach(() => {
    terminalBuffer = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalBuffer);
    fetchFn = jest.fn();
    WebClient.mockRequestFn(fetchFn as unknown as FetchFnType);
  });

  afterEach(() => {
    WebClient.resetMockRequestFn();
  });

  describe('tryGetCacheEntryBufferByIdAsync', () => {
    it('prints warning if read credentials are not available', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);

      mocked(fetchFn).mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
        ok: false
      });

      const result = await provider.tryGetCacheEntryBufferByIdAsync(terminal, 'some-key');
      expect(result).toBe(undefined);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenNthCalledWith(
        1,
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'GET',
          redirect: 'follow'
        })
      );
      expect(terminalBuffer.getAllOutputAsChunks({ asLines: true })).toMatchInlineSnapshot(`
Array [
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown bytes",
  "[warning] Error getting cache entry: Error: Credentials for https://buildcache.example.acme.com/ have not been provided.",
  "[warning] In CI, verify that RUSH_BUILD_CACHE_CREDENTIAL contains a valid Authorization header value.",
  "[warning] ",
  "[warning] For local developers, run:",
  "[warning] ",
  "[warning]     rush update-cloud-credentials --interactive",
  "[warning] ",
]
`);
    });

    it('attempts up to 3 times to download a cache entry', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);

      mocked(fetchFn).mockResolvedValueOnce({
        status: 500,
        statusText: 'InternalServiceError',
        ok: false
      });
      mocked(fetchFn).mockResolvedValueOnce({
        status: 503,
        statusText: 'ServiceUnavailable',
        ok: false
      });
      mocked(fetchFn).mockResolvedValueOnce({
        status: 504,
        statusText: 'BadGateway',
        ok: false
      });

      const result = await provider.tryGetCacheEntryBufferByIdAsync(terminal, 'some-key');
      expect(result).toBe(undefined);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(fetchFn).toHaveBeenNthCalledWith(
        1,
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'GET',
          redirect: 'follow'
        })
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'GET',
          redirect: 'follow'
        })
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        3,
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'GET',
          redirect: 'follow'
        })
      );
      expect(terminalBuffer.getAllOutputAsChunks({ asLines: true })).toMatchInlineSnapshot(`
Array [
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown bytes",
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown bytes",
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown bytes",
  "[warning] Could not get cache entry: HTTP 504: BadGateway",
]
`);
    });
  });
});
