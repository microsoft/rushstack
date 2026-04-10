// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/rush-sdk/lib/utilities/WebClient', () => {
  return jest.requireActual('@microsoft/rush-lib/lib/utilities/WebClient');
});

jest.mock('node:stream/promises', () => ({
  pipeline: jest.fn().mockResolvedValue(undefined)
}));

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type RushSession, EnvironmentConfiguration } from '@rushstack/rush-sdk';
import { type ICredentialCacheEntry, CredentialCache } from '@rushstack/credential-cache';
import { FileSystem } from '@rushstack/node-core-library';
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

const WRITE_ALLOWED_OPTIONS: IHttpBuildCacheProviderOptions = {
  ...EXAMPLE_OPTIONS,
  isCacheWriteAllowed: true
};

type FetchFnType = Parameters<typeof WebClient.mockRequestFn>[0];
type StreamFetchFnType = Parameters<typeof WebClient.mockStreamRequestFn>[0];

describe('HttpBuildCacheProvider', () => {
  let terminalBuffer: StringBufferTerminalProvider;
  let terminal!: Terminal;
  let fetchFn: jest.Mock;
  let streamFetchFn: jest.Mock;

  beforeEach(() => {
    terminalBuffer = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalBuffer);
    fetchFn = jest.fn();
    streamFetchFn = jest.fn();
    WebClient.mockRequestFn(fetchFn as unknown as FetchFnType);
    WebClient.mockStreamRequestFn(streamFetchFn as unknown as StreamFetchFnType);
    jest
      .spyOn(FileSystem, 'createReadStream')
      .mockReturnValue({ pipe: jest.fn() } as unknown as ReturnType<typeof FileSystem.createReadStream>);
    jest
      .spyOn(FileSystem, 'createWriteStreamAsync')
      .mockResolvedValue({} as unknown as Awaited<ReturnType<typeof FileSystem.createWriteStreamAsync>>);
    jest.spyOn(FileSystem, 'ensureFolderAsync').mockResolvedValue();
  });

  afterEach(() => {
    WebClient.resetMockRequestFn();
    WebClient.resetMockStreamRequestFn();
    jest.restoreAllMocks();
  });

  // ── Buffer-based GET ──────────────────────────────────────────────────────

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
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown length[n]",
  "[warning] Error getting cache entry: Error: Credentials for https://buildcache.example.acme.com/ have not been provided.[n]",
  "[warning] In CI, verify that RUSH_BUILD_CACHE_CREDENTIAL contains a valid Authorization header value.[n]",
  "[warning] [n]",
  "[warning] For local developers, run:[n]",
  "[warning] [n]",
  "[warning]     rush update-cloud-credentials --interactive[n]",
  "[warning] [n]",
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
        statusText: 'Gateway Timeout',
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
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown length[n]",
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown length[n]",
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown length[n]",
  "[warning] Could not get cache entry: HTTP 504: Gateway Timeout[n]",
]
`);
    });

    it('returns a buffer on a successful response', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);
      const expectedBuffer = Buffer.from('cache-contents');

      mocked(fetchFn).mockResolvedValue({
        status: 200,
        statusText: 'OK',
        ok: true,
        redirected: false,
        headers: {},
        getBufferAsync: () => Promise.resolve(expectedBuffer)
      });

      const result = await provider.tryGetCacheEntryBufferByIdAsync(terminal, 'some-key');
      expect(result).toEqual(expectedBuffer);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── Buffer-based SET ──────────────────────────────────────────────────────

  describe('trySetCacheEntryBufferAsync', () => {
    it('returns false when cache write is not allowed', async () => {
      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session); // write not allowed

      const result = await provider.trySetCacheEntryBufferAsync(terminal, 'some-key', Buffer.from('data'));

      expect(result).toBe(false);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('uploads a buffer successfully', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, session);

      mocked(fetchFn).mockResolvedValue({
        status: 200,
        statusText: 'OK',
        ok: true,
        redirected: false,
        headers: {}
      });

      const result = await provider.trySetCacheEntryBufferAsync(
        terminal,
        'some-key',
        Buffer.from('cache-data')
      );

      expect(result).toBe(true);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('retries up to 3 times on server error', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, session);

      mocked(fetchFn).mockResolvedValue({
        status: 500,
        statusText: 'InternalServerError',
        ok: false
      });

      const result = await provider.trySetCacheEntryBufferAsync(terminal, 'some-key', Buffer.from('data'));

      expect(result).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });
  });

  // ── File-based GET ──────────────────────────────────────────────────────

  describe('tryDownloadCacheEntryToFileAsync', () => {
    it('downloads to file on a successful response', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);
      const mockStream = new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValue({
        status: 200,
        statusText: 'OK',
        ok: true,
        redirected: false,
        headers: {},
        stream: mockStream
      });

      const result = await provider.tryDownloadCacheEntryToFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );
      expect(result).toBe(true);
      expect(streamFetchFn).toHaveBeenCalledTimes(1);
      expect(streamFetchFn).toHaveBeenCalledWith(
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'GET',
          redirect: 'follow'
        })
      );
      expect(pipeline).toHaveBeenCalledWith(mockStream, expect.anything());
    });

    it('returns false on 404 cache miss', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);
      const mockStream = new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        ok: false,
        stream: mockStream
      });

      const result = await provider.tryDownloadCacheEntryToFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );
      expect(result).toBe(false);
      expect(pipeline).not.toHaveBeenCalled();
    });

    it('returns false on credential failure', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);
      const mockStream = new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
        ok: false,
        stream: mockStream
      });

      const result = await provider.tryDownloadCacheEntryToFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );
      expect(result).toBe(false);
    });

    it('retries up to 3 times on server error', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session);
      const createMockStream = (): Readable => new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValueOnce({
        status: 500,
        statusText: 'InternalServiceError',
        ok: false,
        stream: createMockStream()
      });
      mocked(streamFetchFn).mockResolvedValueOnce({
        status: 503,
        statusText: 'ServiceUnavailable',
        ok: false,
        stream: createMockStream()
      });
      mocked(streamFetchFn).mockResolvedValueOnce({
        status: 504,
        statusText: 'Gateway Timeout',
        ok: false,
        stream: createMockStream()
      });

      const result = await provider.tryDownloadCacheEntryToFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );
      expect(result).toBe(false);
      expect(streamFetchFn).toHaveBeenCalledTimes(3);
    });
  });

  // ── File-based SET ──────────────────────────────────────────────────────

  describe('tryUploadCacheEntryFromFileAsync', () => {
    it('returns false when cache write is not allowed', async () => {
      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(EXAMPLE_OPTIONS, session); // write not allowed

      const result = await provider.tryUploadCacheEntryFromFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );

      expect(result).toBe(false);
      expect(streamFetchFn).not.toHaveBeenCalled();
    });

    it('uploads from file successfully', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, session);
      const responseStream = new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValue({
        status: 200,
        statusText: 'OK',
        ok: true,
        redirected: false,
        headers: {},
        stream: responseStream
      });

      const result = await provider.tryUploadCacheEntryFromFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );

      expect(result).toBe(true);
      expect(streamFetchFn).toHaveBeenCalledTimes(1);
      expect(streamFetchFn).toHaveBeenCalledWith(
        'https://buildcache.example.acme.com/some-key',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('does not retry on failure (file stream already consumed)', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, session);
      const responseStream = new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValue({
        status: 500,
        statusText: 'InternalServerError',
        ok: false,
        stream: responseStream
      });

      const result = await provider.tryUploadCacheEntryFromFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );

      expect(result).toBe(false);
      // maxAttempts is 1 for file-based uploads, so only 1 call
      expect(streamFetchFn).toHaveBeenCalledTimes(1);
    });

    it('skips credential fallback for file-based uploads on 4xx', async () => {
      // No credential in env for the first attempt
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);
      // But credentials ARE available in the credential cache — without the stream-body
      // guard, the credential fallback would resolve these and make a second HTTP request
      // with the already-consumed stream body.
      jest
        .spyOn(CredentialCache, 'usingAsync')
        // eslint-disable-next-line @typescript-eslint/naming-convention
        .mockImplementation(async (_options, fn) => {
          await (fn as (cache: CredentialCache) => Promise<void>)({
            tryGetCacheEntry: (): ICredentialCacheEntry => ({ credential: 'cached-token' })
          } as unknown as CredentialCache);
        });

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, session);
      const responseStream = new Readable({ read() {} });

      mocked(streamFetchFn).mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
        ok: false,
        stream: responseStream
      });

      // Even though credentials are optional and we got a 4xx, the stream body
      // should prevent the credential fallback retry since the stream is consumed
      const result = await provider.tryUploadCacheEntryFromFileAsync(
        terminal,
        'some-key',
        '/tmp/cache-entry'
      );

      expect(result).toBe(false);
      // Should only be called once (no credential fallback retry with consumed stream)
      expect(streamFetchFn).toHaveBeenCalledTimes(1);
    });
  });
});
