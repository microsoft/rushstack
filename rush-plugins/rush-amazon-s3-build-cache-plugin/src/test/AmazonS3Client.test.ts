// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/rush-sdk/lib/utilities/WebClient', () => {
  return jest.requireActual('@microsoft/rush-lib/lib/utilities/WebClient');
});

import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import { WebClient } from '@rushstack/rush-sdk/lib/utilities/WebClient';

import type { IAmazonS3BuildCacheProviderOptionsAdvanced } from '../AmazonS3BuildCacheProvider.ts';
import { AmazonS3Client } from '../AmazonS3Client.ts';
import type { IAmazonS3Credentials } from '../AmazonS3Credentials.ts';

const webClient = new WebClient();

const DUMMY_OPTIONS_WITHOUT_ENDPOINT: Omit<IAmazonS3BuildCacheProviderOptionsAdvanced, 's3Endpoint'> = {
  s3Region: 'us-east-1',
  isCacheWriteAllowed: true,
  s3Prefix: undefined
};

const DUMMY_OPTIONS: IAmazonS3BuildCacheProviderOptionsAdvanced = {
  ...DUMMY_OPTIONS_WITHOUT_ENDPOINT,
  s3Endpoint: 'http://localhost:9000'
};

const terminal = new Terminal(
  new ConsoleTerminalProvider({
    verboseEnabled: false,
    debugEnabled: false
  })
);

interface ITestOptions {
  shouldRetry: boolean;
}

class MockedDate extends Date {
  public constructor() {
    super(2020, 3, 18, 12, 32, 42, 493);
  }

  public toISOString(): string {
    return '2020-04-18T12:32:42.493Z';
  }
}

describe(AmazonS3Client.name, () => {
  it('Rejects invalid S3 endpoint values', () => {
    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: undefined!, ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'abc', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://address.com/', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://-abc', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://abc.--.invalid', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'https://?', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://10.10.10.10:abcd', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://abc..d', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://abc.-d', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://abc-.d', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: `http://abc.${new Array(100).join('a')}.def:123`, ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).toThrowErrorMatchingSnapshot();
  });

  it('Accepts valid S3 bucket names', () => {
    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'https://abc123', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).not.toThrow();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'http://abc', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).not.toThrow();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'https://foo-bar-baz:9000', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).not.toThrow();

    expect(
      () =>
        new AmazonS3Client(
          undefined,
          { s3Endpoint: 'https://foo.bar.baz', ...DUMMY_OPTIONS_WITHOUT_ENDPOINT },
          webClient,
          terminal
        )
    ).not.toThrow();
  });

  it('Does not allow upload without credentials', async () => {
    const client: AmazonS3Client = new AmazonS3Client(
      undefined,
      {
        s3Endpoint: 'http://foo.bar.baz',
        ...DUMMY_OPTIONS_WITHOUT_ENDPOINT
      },
      webClient,
      terminal
    );
    try {
      await client.uploadObjectAsync('temp', undefined!);
      fail('Expected an exception to be thrown');
    } catch (e) {
      expect(e).toMatchSnapshot();
    }
  });

  describe('Making requests', () => {
    interface IResponseOptions {
      body?: string;
      status: number;
      statusText?: string;
    }

    let realDate: typeof Date;
    let realSetTimeout: typeof setTimeout;
    beforeEach(() => {
      // mock date
      realDate = global.Date;
      global.Date = MockedDate as typeof Date;

      // mock setTimeout
      realSetTimeout = global.setTimeout;
      global.setTimeout = ((callback: () => void, time: number) => {
        return realSetTimeout(callback, 1);
      }).bind(global) as typeof global.setTimeout;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      global.Date = realDate;
      global.setTimeout = realSetTimeout.bind(global);
    });

    async function makeS3ClientRequestAsync<TResponse>(
      credentials: IAmazonS3Credentials | undefined,
      options: IAmazonS3BuildCacheProviderOptionsAdvanced,
      request: (s3Client: AmazonS3Client) => Promise<TResponse>,
      response: IResponseOptions,
      testOptions: ITestOptions
    ): Promise<TResponse> {
      const body: string | undefined = response.body;
      const spy: jest.SpyInstance = jest.spyOn(WebClient.prototype, 'fetchAsync').mockReturnValue(
        Promise.resolve({
          getBufferAsync: body
            ? () => Promise.resolve(Buffer.from(body))
            : () => Promise.reject(new Error('No body provided')),
          getTextAsync: body
            ? () => Promise.resolve(body)
            : () => Promise.reject(new Error('No body provided')),
          getJsonAsync: body
            ? () => Promise.resolve(JSON.parse(body))
            : () => Promise.reject(new Error('No body provided')),
          headers: {},
          status: response.status,
          statusText: response.statusText,
          ok: response.status >= 200 && response.status < 300,
          redirected: false
        })
      );

      const s3Client: AmazonS3Client = new AmazonS3Client(credentials, options, webClient, terminal);
      let result: TResponse;
      let error: Error | undefined;
      try {
        result = await request(s3Client);
      } catch (e) {
        error = e as Error;
      }

      if (testOptions.shouldRetry) {
        expect(spy).toHaveBeenCalledTimes(4);
      } else {
        expect(spy).toHaveBeenCalledTimes(1);
      }
      expect(spy.mock.calls[0]).toMatchSnapshot();
      spy.mockRestore();

      if (error) {
        throw error;
      } else {
        return result!;
      }
    }

    async function runAndExpectErrorAsync(fnAsync: () => Promise<unknown>): Promise<void> {
      try {
        await fnAsync();
        throw new Error('Expected an error to be thrown');
      } catch (e) {
        // The way an error is formatted changed in Node 16. Normalize, so snapshots match.
        (e as Error).message = (e as Error).message.replace(
          /^Cannot read property '(.+)' of undefined$/g,
          "Cannot read properties of undefined (reading '$1')"
        );

        expect(e).toMatchSnapshot();
      }
    }

    describe('Getting an object', () => {
      async function makeGetRequestAsync(
        credentials: IAmazonS3Credentials | undefined,
        options: IAmazonS3BuildCacheProviderOptionsAdvanced,
        objectName: string,
        response: IResponseOptions,
        testOptions: ITestOptions
      ): Promise<Buffer | undefined> {
        return await makeS3ClientRequestAsync(
          credentials,
          options,
          async (s3Client) => {
            return await s3Client.getObjectAsync(objectName);
          },
          response,
          testOptions
        );
      }

      function registerGetTests(credentials: IAmazonS3Credentials | undefined): void {
        it('Can get an object', async () => {
          const expectedContents: string = 'abc123-contents';

          const result: Buffer | undefined = await makeGetRequestAsync(
            credentials,
            DUMMY_OPTIONS,
            'abc123',
            {
              body: expectedContents,
              status: 200
            },
            {
              shouldRetry: false
            }
          );
          expect(result).toBeDefined();
          expect(result?.toString()).toBe(expectedContents);
        });

        it('Can get an object from a different region', async () => {
          const expectedContents: string = 'abc123-contents';

          const result: Buffer | undefined = await makeGetRequestAsync(
            credentials,
            { ...DUMMY_OPTIONS, s3Region: 'us-west-1' },
            'abc123',
            {
              body: expectedContents,
              status: 200
            },
            { shouldRetry: false }
          );
          expect(result).toBeDefined();
          expect(result?.toString()).toBe(expectedContents);
        });

        it('Handles a missing object', async () => {
          const result: Buffer | undefined = await makeGetRequestAsync(
            credentials,
            DUMMY_OPTIONS,
            'abc123',
            {
              status: 404,
              statusText: 'Not Found'
            },
            {
              shouldRetry: false
            }
          );
          expect(result).toBeUndefined();
        });

        it('Handles an unexpected error', async () => {
          const spy = jest.spyOn(global, 'setTimeout');
          await runAndExpectErrorAsync(
            async () =>
              await makeGetRequestAsync(
                credentials,
                DUMMY_OPTIONS,
                'abc123',
                {
                  status: 500,
                  statusText: 'Server Error'
                },
                {
                  shouldRetry: true
                }
              )
          );
          expect(setTimeout).toHaveBeenCalledTimes(3);
          expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 4000);
          expect(setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 8000);
          expect(setTimeout).toHaveBeenNthCalledWith(3, expect.any(Function), 16000);
          spy.mockReset();
          spy.mockRestore();
        });

        if (credentials) {
          it('should not retry on 400 error', async () => {
            const spy = jest.spyOn(global, 'setTimeout');
            await runAndExpectErrorAsync(
              async () =>
                await makeGetRequestAsync(
                  credentials,
                  DUMMY_OPTIONS,
                  'abc123',
                  {
                    status: 400,
                    statusText: 'Bad Request'
                  },
                  {
                    shouldRetry: false
                  }
                )
            );
            expect(setTimeout).toHaveBeenCalledTimes(0);
            spy.mockReset();
            spy.mockRestore();
          });

          it('should not retry on 401 error', async () => {
            const spy = jest.spyOn(global, 'setTimeout');
            await runAndExpectErrorAsync(
              async () =>
                await makeGetRequestAsync(
                  credentials,
                  DUMMY_OPTIONS,
                  'abc123',
                  {
                    status: 401,
                    statusText: 'Unauthorized'
                  },
                  {
                    shouldRetry: false
                  }
                )
            );
            expect(setTimeout).toHaveBeenCalledTimes(0);
            spy.mockReset();
            spy.mockRestore();
          });
        }
      }

      describe('Without credentials', () => {
        registerGetTests(undefined);

        for (const code of [400, 401, 403]) {
          it(`Handles missing credentials object when ${code}`, async () => {
            let warningSpy: jest.SpyInstance<unknown, unknown[]> | undefined;
            const result: Buffer | undefined = await makeS3ClientRequestAsync(
              undefined,
              DUMMY_OPTIONS,
              async (s3Client) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (s3Client as any)._writeWarningLine = () => {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                warningSpy = jest.spyOn(s3Client as any, '_writeWarningLine');
                return await s3Client.getObjectAsync('abc123');
              },
              {
                status: code,
                statusText: 'Unauthorized'
              },
              {
                shouldRetry: false
              }
            );
            expect(result).toBeUndefined();
            expect(warningSpy).toHaveBeenNthCalledWith(
              1,
              `No credentials found and received a ${code}`,
              ' response code from the cloud storage.',
              ' Maybe run rush update-cloud-credentials',
              ' or set the RUSH_BUILD_CACHE_CREDENTIAL env'
            );
          });
        }
      });

      function registerGetWithCredentialsTests(credentials: IAmazonS3Credentials): void {
        registerGetTests(credentials);

        it('Handles a 403 error', async () => {
          await runAndExpectErrorAsync(
            async () =>
              await makeGetRequestAsync(
                credentials,
                DUMMY_OPTIONS,
                'abc123',
                {
                  status: 403,
                  statusText: 'Unauthorized'
                },
                {
                  shouldRetry: false
                }
              )
          );
        });
      }

      describe('With credentials', () => {
        registerGetWithCredentialsTests({
          accessKeyId: 'accessKeyId',
          secretAccessKey: 'secretAccessKey',
          sessionToken: undefined
        });
      });

      describe('With credentials including a session token', () => {
        registerGetWithCredentialsTests({
          accessKeyId: 'accessKeyId',
          secretAccessKey: 'secretAccessKey',
          sessionToken: 'sessionToken'
        });
      });
    });

    describe('Uploading an object', () => {
      async function makeUploadRequestAsync(
        credentials: IAmazonS3Credentials | undefined,
        options: IAmazonS3BuildCacheProviderOptionsAdvanced,
        objectName: string,
        objectContents: string,
        response: IResponseOptions,
        testOptions: ITestOptions
      ): Promise<void> {
        return await makeS3ClientRequestAsync(
          credentials,
          options,
          async (s3Client) => {
            return await s3Client.uploadObjectAsync(objectName, Buffer.from(objectContents));
          },
          response,
          testOptions
        );
      }

      it('Throws an error if credentials are not provided', async () => {
        await runAndExpectErrorAsync(
          async () =>
            await makeUploadRequestAsync(undefined, DUMMY_OPTIONS, 'abc123', 'abc123-contents', undefined!, {
              shouldRetry: false
            })
        );
      });

      function registerUploadTests(credentials: IAmazonS3Credentials): void {
        it('Uploads an object', async () => {
          await makeUploadRequestAsync(
            credentials,
            DUMMY_OPTIONS,
            'abc123',
            'abc123-contents',
            {
              status: 200
            },
            { shouldRetry: false }
          );
        });

        it('Uploads an object to a different region', async () => {
          await makeUploadRequestAsync(
            credentials,
            { ...DUMMY_OPTIONS, s3Region: 'us-west-1' },
            'abc123',
            'abc123-contents',
            {
              status: 200
            },
            { shouldRetry: false }
          );
        });

        it('Handles an unexpected error code', async () => {
          await runAndExpectErrorAsync(
            async () =>
              await makeUploadRequestAsync(
                credentials,
                DUMMY_OPTIONS,
                'abc123',
                'abc123-contents',
                {
                  status: 500,
                  statusText: 'Server Error'
                },
                { shouldRetry: true }
              )
          );
        });
      }

      describe('With credentials', () => {
        registerUploadTests({
          accessKeyId: 'accessKeyId',
          secretAccessKey: 'secretAccessKey',
          sessionToken: undefined
        });
      });

      describe('With credentials including a session token', () => {
        registerUploadTests({
          accessKeyId: 'accessKeyId',
          secretAccessKey: 'secretAccessKey',
          sessionToken: 'sessionToken'
        });
      });
    });
  });

  describe(AmazonS3Client.UriEncode.name, () => {
    it('can encode', () => {
      expect(
        AmazonS3Client.UriEncode(
          '/@rushstack+rush-azure-storage-build-cache-plugin-_phase_test-5d4149e2298bc927fd33355fb168e6a89ba88fa6'
        )
      ).toBe(
        '/%40rushstack%2Brush-azure-storage-build-cache-plugin-_phase_test-5d4149e2298bc927fd33355fb168e6a89ba88fa6'
      );
    });
  });
});
