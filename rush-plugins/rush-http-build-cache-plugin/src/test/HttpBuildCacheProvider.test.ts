// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/rush-sdk/lib/utilities/WebClient', () => {
  return jest.requireActual('@microsoft/rush-lib/lib/utilities/WebClient');
});

jest.mock('node:stream/promises', () => ({
  pipeline: jest.fn().mockResolvedValue(undefined)
}));

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { type RushSession, EnvironmentConfiguration } from '@rushstack/rush-sdk';
import { type ICredentialCacheEntry, CredentialCache } from '@rushstack/credential-cache';
import { Async, FileSystem, type FileSystemReadStream } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import {
  WebClient,
  type IWebClientResponse,
  type IWebClientStreamResponse
} from '@rushstack/rush-sdk/lib/utilities/WebClient';

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

describe(HttpBuildCacheProvider.name, () => {
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
      .mockImplementation((): FileSystemReadStream => new Readable({ read() {} }) as FileSystemReadStream);
    jest
      .spyOn(FileSystem, 'getStatisticsAsync')
      .mockResolvedValue({ size: 123 } as Awaited<ReturnType<typeof FileSystem.getStatisticsAsync>>);
    jest
      .spyOn(FileSystem, 'createWriteStreamAsync')
      .mockResolvedValue({} as unknown as Awaited<ReturnType<typeof FileSystem.createWriteStreamAsync>>);
    jest.spyOn(FileSystem, 'ensureFolderAsync').mockResolvedValue();
    jest.spyOn(Async, 'sleepAsync').mockResolvedValue();
    jest.spyOn(Math, 'random').mockReturnValue(0);
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

      jest.mocked(fetchFn).mockResolvedValue({
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

      jest.mocked(fetchFn).mockResolvedValueOnce({
        status: 500,
        statusText: 'InternalServiceError',
        ok: false
      });
      jest.mocked(fetchFn).mockResolvedValueOnce({
        status: 503,
        statusText: 'ServiceUnavailable',
        ok: false
      });
      jest.mocked(fetchFn).mockResolvedValueOnce({
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
  "[verbose] [http-build-cache] GET attempt 1/3 failed: HTTP 500: InternalServiceError. Retrying attempt 2/3 in 1 ms.[n]",
  "[  debug] [http-build-cache] request: GET https://buildcache.example.acme.com/some-key unknown length[n]",
  "[verbose] [http-build-cache] GET attempt 2/3 failed: HTTP 503: ServiceUnavailable. Retrying attempt 3/3 in 2 ms.[n]",
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

      jest.mocked(fetchFn).mockResolvedValue({
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

      jest.mocked(fetchFn).mockResolvedValue({
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

      jest.mocked(fetchFn).mockResolvedValue({
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

      jest.mocked(streamFetchFn).mockResolvedValue({
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

      jest.mocked(streamFetchFn).mockResolvedValue({
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

      jest.mocked(streamFetchFn).mockResolvedValue({
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

      jest.mocked(streamFetchFn).mockResolvedValueOnce({
        status: 500,
        statusText: 'InternalServiceError',
        ok: false,
        stream: createMockStream()
      });
      jest.mocked(streamFetchFn).mockResolvedValueOnce({
        status: 503,
        statusText: 'ServiceUnavailable',
        ok: false,
        stream: createMockStream()
      });
      jest.mocked(streamFetchFn).mockResolvedValueOnce({
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

      jest.mocked(streamFetchFn).mockResolvedValue({
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
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Length': '123'
          })
        })
      );
    });

    it('retries with a fresh file stream on failure', async () => {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');

      const session: RushSession = {} as RushSession;
      const provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, session);
      const responseStream = new Readable({ read() {} });

      jest.mocked(streamFetchFn).mockResolvedValue({
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
      expect(streamFetchFn).toHaveBeenCalledTimes(3);
      expect(FileSystem.createReadStream).toHaveBeenCalledTimes(3);
      const streams: FileSystemReadStream[] = jest
        .mocked(FileSystem.createReadStream)
        .mock.results.map((streamResult: jest.MockResult<FileSystemReadStream>) => streamResult.value);
      expect(new Set(streams).size).toBe(3);
      for (const stream of streams) {
        expect(stream.destroyed).toBe(true);
      }

      expect(responseStream.destroyed).toBe(true);
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

      jest.mocked(streamFetchFn).mockResolvedValue({
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

    describe.each(['buffer', 'file'] as const)('%s upload retries', (transferMode: 'buffer' | 'file') => {
      let provider: HttpBuildCacheProvider;
      let requestMock: jest.Mock;

      beforeEach(() => {
        jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');
        provider = new HttpBuildCacheProvider(WRITE_ALLOWED_OPTIONS, {} as RushSession);
        requestMock = transferMode === 'buffer' ? fetchFn : streamFetchFn;
      });

      function createResponse(
        status: number,
        headers: Record<string, string | string[]> = {}
      ): IWebClientResponse | IWebClientStreamResponse {
        const response: IWebClientResponse = {
          ok: status >= 200 && status < 300,
          status,
          statusText: 'test response',
          redirected: false,
          headers,
          getBufferAsync: jest.fn(),
          getTextAsync: jest.fn(),
          getJsonAsync: jest.fn()
        };
        return transferMode === 'file' ? { ...response, stream: new Readable({ read() {} }) } : response;
      }

      async function uploadAsync(): Promise<boolean> {
        return transferMode === 'buffer'
          ? await provider.trySetCacheEntryBufferAsync(terminal, 'some-key', Buffer.from('cache contents'))
          : await provider.tryUploadCacheEntryFromFileAsync(
              terminal,
              'some-key',
              `${__dirname}/../../temp/cache-entry`
            );
      }

      it.each([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524])(
        'recovers from HTTP %s without warnings',
        async (status: number) => {
          requestMock
            .mockResolvedValueOnce(createResponse(status))
            .mockResolvedValueOnce(createResponse(200));

          expect(await uploadAsync()).toBe(true);
          expect(requestMock).toHaveBeenCalledTimes(2);
          expect(Async.sleepAsync).toHaveBeenCalledTimes(1);
          expect(terminalBuffer.getWarningOutput()).toBe('');
        }
      );

      it('exhausts the three-attempt HTTP budget and reports the final failure', async () => {
        requestMock.mockResolvedValue(createResponse(520, { 'cf-ray': 'ray-exhausted' }));

        expect(await uploadAsync()).toBe(false);
        expect(requestMock).toHaveBeenCalledTimes(3);
        expect(Async.sleepAsync).toHaveBeenCalledTimes(2);
        expect(terminalBuffer.getWarningOutput()).toContain(
          'Could not write cache entry: HTTP 520: test response (cf-ray: ray-exhausted)'
        );
      });

      it.each([
        'ECONNRESET',
        'ECONNREFUSED',
        'ECONNABORTED',
        'ETIMEDOUT',
        'EPIPE',
        'EAI_AGAIN',
        'ENETUNREACH',
        'EHOSTUNREACH'
      ])('recovers from %s without warnings', async (code: string) => {
        requestMock
          .mockRejectedValueOnce(Object.assign(new Error('transient transport error'), { code }))
          .mockResolvedValueOnce(createResponse(200));

        expect(await uploadAsync()).toBe(true);
        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(terminalBuffer.getWarningOutput()).toBe('');
        if (transferMode === 'file') {
          const [first, second] = requestMock.mock.calls;
          expect(first[1].body).not.toBe(second[1].body);
          expect(first[1].body.destroyed).toBe(true);
        }
      });

      it('shares the attempt budget between HTTP and transport failures', async () => {
        requestMock
          .mockRejectedValueOnce(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
          .mockResolvedValueOnce(createResponse(520))
          .mockResolvedValueOnce(createResponse(200));

        expect(await uploadAsync()).toBe(true);
        expect(requestMock).toHaveBeenCalledTimes(3);
        expect(Async.sleepAsync).toHaveBeenNthCalledWith(1, 1);
        expect(Async.sleepAsync).toHaveBeenNthCalledWith(2, 2);
      });

      it('reports the final transport error after exhausting retries', async () => {
        requestMock.mockRejectedValue(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));

        expect(await uploadAsync()).toBe(false);
        expect(requestMock).toHaveBeenCalledTimes(3);
        expect(Async.sleepAsync).toHaveBeenCalledTimes(2);
        expect(terminalBuffer.getWarningOutput()).toContain(
          'Error uploading cache entry: Error: read ECONNRESET'
        );
      });

      it.each([400, 401, 403, 404, 405, 407, 413, 501, 505, 526])(
        'does not retry permanent HTTP %s failures',
        async (status: number) => {
          requestMock.mockResolvedValue(createResponse(status));

          expect(await uploadAsync()).toBe(false);
          expect(requestMock).toHaveBeenCalledTimes(1);
          expect(Async.sleepAsync).not.toHaveBeenCalled();
          expect(terminalBuffer.getWarningOutput()).not.toBe('');
        }
      );

      it.each(['ENOENT', 'EACCES', 'ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID'])(
        'does not retry permanent %s errors',
        async (code: string) => {
          requestMock.mockRejectedValue(Object.assign(new Error('permanent error'), { code }));

          expect(await uploadAsync()).toBe(false);
          expect(requestMock).toHaveBeenCalledTimes(1);
          expect(Async.sleepAsync).not.toHaveBeenCalled();
          expect(terminalBuffer.getWarningOutput()).toContain('permanent error');
        }
      );

      it('does not retry an unclassified exception', async () => {
        requestMock.mockRejectedValue(new Error('unexpected failure'));

        expect(await uploadAsync()).toBe(false);
        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(terminalBuffer.getWarningOutput()).toContain('unexpected failure');
      });

      it('uses exponential backoff with jitter', async () => {
        jest.mocked(Math.random).mockReturnValue(0.5);
        requestMock.mockResolvedValue(createResponse(520));

        expect(await uploadAsync()).toBe(false);
        expect(Async.sleepAsync).toHaveBeenNthCalledWith(1, 1);
        expect(Async.sleepAsync).toHaveBeenNthCalledWith(2, 3);
      });

      it('caps the exponential backoff', async () => {
        provider = new HttpBuildCacheProvider(
          { ...WRITE_ALLOWED_OPTIONS, minHttpRetryDelayMs: 40000 },
          {} as RushSession
        );
        requestMock.mockResolvedValue(createResponse(520));

        expect(await uploadAsync()).toBe(false);
        expect(Async.sleepAsync).toHaveBeenNthCalledWith(1, 40000);
        expect(Async.sleepAsync).toHaveBeenNthCalledWith(2, 60000);
      });

      it('honors Retry-After delta seconds', async () => {
        requestMock
          .mockResolvedValueOnce(createResponse(429, { 'retry-after': '7' }))
          .mockResolvedValueOnce(createResponse(200));

        expect(await uploadAsync()).toBe(true);
        expect(Async.sleepAsync).toHaveBeenCalledWith(7000);
      });

      it('honors Retry-After HTTP dates', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-29T12:00:00Z'));
        requestMock
          .mockResolvedValueOnce(createResponse(503, { 'retry-after': 'Thu, 29 Oct 2026 12:00:09 GMT' }))
          .mockResolvedValueOnce(createResponse(200));

        expect(await uploadAsync()).toBe(true);
        expect(Async.sleepAsync).toHaveBeenCalledWith(9000);
      });

      it.each(['invalid', '-1', 'Thu, 01 Jan 1970 00:00:00 GMT', '0'])(
        'uses backoff for expired or invalid Retry-After %s',
        async (retryAfter: string) => {
          requestMock
            .mockResolvedValueOnce(createResponse(503, { 'retry-after': retryAfter }))
            .mockResolvedValueOnce(createResponse(200));

          expect(await uploadAsync()).toBe(true);
          expect(Async.sleepAsync).toHaveBeenCalledWith(1);
        }
      );

      it('accepts an array-valued Retry-After header', async () => {
        requestMock
          .mockResolvedValueOnce(createResponse(503, { 'retry-after': ['5'] }))
          .mockResolvedValueOnce(createResponse(200));

        expect(await uploadAsync()).toBe(true);
        expect(Async.sleepAsync).toHaveBeenCalledWith(5000);
      });

      it('does not retry earlier than a Retry-After exceeding the wait limit', async () => {
        requestMock.mockResolvedValue(createResponse(503, { 'retry-after': '61' }));

        expect(await uploadAsync()).toBe(false);
        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(Async.sleepAsync).not.toHaveBeenCalled();
        expect(terminalBuffer.getVerboseOutput()).toContain('Retry-After exceeds 60000 ms');
        expect(terminalBuffer.getOutput()).toContain('Could not write cache entry: HTTP 503');
      });

      it('logs attempts and cf-ray without logging authorization headers', async () => {
        requestMock
          .mockResolvedValueOnce(createResponse(520, { 'cf-ray': 'ray-to-correlate' }))
          .mockResolvedValueOnce(createResponse(200));

        expect(await uploadAsync()).toBe(true);
        const output: string = terminalBuffer.getVerboseOutput();
        expect(output).toContain(
          'POST attempt 1/3 failed: HTTP 520: test response (cf-ray: ray-to-correlate)'
        );
        expect(output).toContain('Retrying attempt 2/3 in 1 ms');
        expect(output).not.toContain('token123');
      });

      if (transferMode === 'file') {
        it('reports a local file error without retrying', async () => {
          jest.mocked(FileSystem.createReadStream).mockImplementation((): never => {
            throw Object.assign(new Error('file missing'), { code: 'ENOENT' });
          });

          expect(await uploadAsync()).toBe(false);
          expect(requestMock).not.toHaveBeenCalled();
          expect(Async.sleepAsync).not.toHaveBeenCalled();
          expect(terminalBuffer.getWarningOutput()).toContain('file missing');
        });
      }
    });

    describe('stream upload transport', () => {
      it.each(['HTTP 520', 'early HTTP 520', 'ECONNRESET'])(
        'replays the complete file after %s using the real HTTP client',
        async (failure: string) => {
          WebClient.resetMockStreamRequestFn();
          jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue('token123');
          const content: Buffer = Buffer.alloc(123, 'cache contents');
          const streams: Readable[] = [];
          jest.mocked(FileSystem.createReadStream).mockImplementation((): FileSystemReadStream => {
            let chunkSent: boolean = false;
            const stream: Readable =
              failure === 'early HTTP 520' && streams.length === 0
                ? new Readable({
                    read(): void {
                      if (!chunkSent) {
                        chunkSent = true;
                        this.push(content.subarray(0, 1));
                      }
                    }
                  })
                : Readable.from([content]);
            streams.push(stream);
            return stream as FileSystemReadStream;
          });

          const uploads: Buffer[] = [];
          let requests: number = 0;
          const server: Server = createServer((request: IncomingMessage, response: ServerResponse): void => {
            requests++;
            if (requests === 1 && failure === 'ECONNRESET') {
              request.socket.destroy();
              return;
            }

            if (requests === 1 && failure === 'early HTTP 520') {
              response.writeHead(520);
              response.end();
              return;
            }

            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer): void => {
              chunks.push(chunk);
            });
            request.on('end', (): void => {
              uploads.push(Buffer.concat(chunks));
              response.writeHead(requests === 1 ? 520 : 200, { 'cf-ray': 'local-test-ray' });
              response.end();
            });
          });

          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve());
          });

          try {
            const address = server.address();
            if (!address || typeof address === 'string') {
              throw new Error('Expected a TCP server address');
            }

            const provider: HttpBuildCacheProvider = new HttpBuildCacheProvider(
              { ...WRITE_ALLOWED_OPTIONS, url: `http://127.0.0.1:${address.port}/cache/` },
              {} as RushSession
            );
            expect(
              await provider.tryUploadCacheEntryFromFileAsync(
                terminal,
                'some-key',
                `${__dirname}/../../temp/cache-entry`
              )
            ).toBe(true);
            expect(requests).toBe(2);
            expect(streams).toHaveLength(2);
            expect(streams[0]).not.toBe(streams[1]);
            expect(streams[0]?.destroyed).toBe(true);
            expect(uploads).toHaveLength(failure === 'HTTP 520' ? 2 : 1);
            for (const upload of uploads) {
              expect(upload).toEqual(content);
            }

            expect(terminalBuffer.getWarningOutput()).toBe('');
          } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => {
              server.close((error: Error | undefined) => (error ? reject(error) : resolve()));
            });
          }
        }
      );
    });
  });
});
