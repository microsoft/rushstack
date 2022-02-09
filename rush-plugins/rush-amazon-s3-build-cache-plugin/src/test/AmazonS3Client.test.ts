// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, Terminal } from '@rushstack/node-core-library';
import { Response, ResponseInit } from 'node-fetch';

import { IAmazonS3BuildCacheProviderOptionsAdvanced } from '../AmazonS3BuildCacheProvider';
import { AmazonS3Client, IAmazonS3Credentials } from '../AmazonS3Client';
import { WebClient } from '../WebClient';

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
      responseInit: ResponseInit;
    }

    let realDate: typeof Date;
    beforeEach(() => {
      realDate = global.Date;
      global.Date = MockedDate as typeof Date;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      global.Date = realDate;
    });

    async function makeS3ClientRequestAsync<TResponse>(
      credentials: IAmazonS3Credentials | undefined,
      options: IAmazonS3BuildCacheProviderOptionsAdvanced,
      request: (s3Client: AmazonS3Client) => Promise<TResponse>,
      response: IResponseOptions
    ): Promise<TResponse> {
      const spy: jest.SpyInstance = jest
        .spyOn(WebClient.prototype, 'fetchAsync')
        .mockReturnValue(Promise.resolve(new Response(response.body, response.responseInit)));

      const s3Client: AmazonS3Client = new AmazonS3Client(credentials, options, webClient, terminal);
      let result: TResponse;
      let error: Error | undefined;
      try {
        result = await request(s3Client);
      } catch (e) {
        error = e as Error;
      }

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]).toMatchSnapshot();

      if (error) {
        throw error;
      } else {
        return result!;
      }
    }

    async function runAndExpectErrorAsync(fnAsync: () => Promise<unknown>): Promise<void> {
      try {
        await fnAsync();
        fail('Expected an error to be thrown');
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
        response: IResponseOptions
      ): Promise<Buffer | undefined> {
        return await makeS3ClientRequestAsync(
          credentials,
          options,
          async (s3Client) => {
            return await s3Client.getObjectAsync(objectName);
          },
          response
        );
      }

      function registerGetTests(credentials: IAmazonS3Credentials | undefined): void {
        it('Can get an object', async () => {
          const expectedContents: string = 'abc123-contents';

          const result: Buffer | undefined = await makeGetRequestAsync(credentials, DUMMY_OPTIONS, 'abc123', {
            body: expectedContents,
            responseInit: {
              status: 200
            }
          });
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
              responseInit: {
                status: 200
              }
            }
          );
          expect(result).toBeDefined();
          expect(result?.toString()).toBe(expectedContents);
        });

        it('Handles a missing object', async () => {
          const result: Buffer | undefined = await makeGetRequestAsync(credentials, DUMMY_OPTIONS, 'abc123', {
            responseInit: {
              status: 404,
              statusText: 'Not Found'
            }
          });
          expect(result).toBeUndefined();
        });

        it('Handles an unexpected error', async () => {
          await runAndExpectErrorAsync(
            async () =>
              await makeGetRequestAsync(credentials, DUMMY_OPTIONS, 'abc123', {
                responseInit: {
                  status: 500,
                  statusText: 'Server Error'
                }
              })
          );
        });
      }

      describe('Without credentials', () => {
        registerGetTests(undefined);

        it('Handles missing credentials object', async () => {
          const result: Buffer | undefined = await makeGetRequestAsync(undefined, DUMMY_OPTIONS, 'abc123', {
            responseInit: {
              status: 403,
              statusText: 'Unauthorized'
            }
          });
          expect(result).toBeUndefined();
        });
      });

      function registerGetWithCredentialsTests(credentials: IAmazonS3Credentials): void {
        registerGetTests(credentials);

        it('Handles a 403 error', async () => {
          await runAndExpectErrorAsync(
            async () =>
              await makeGetRequestAsync(credentials, DUMMY_OPTIONS, 'abc123', {
                responseInit: {
                  status: 403,
                  statusText: 'Unauthorized'
                }
              })
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
        response: IResponseOptions
      ): Promise<void> {
        return await makeS3ClientRequestAsync(
          credentials,
          options,
          async (s3Client) => {
            return await s3Client.uploadObjectAsync(objectName, Buffer.from(objectContents));
          },
          response
        );
      }

      it('Throws an error if credentials are not provided', async () => {
        await runAndExpectErrorAsync(
          async () =>
            await makeUploadRequestAsync(undefined, DUMMY_OPTIONS, 'abc123', 'abc123-contents', undefined!)
        );
      });

      function registerUploadTests(credentials: IAmazonS3Credentials): void {
        it('Uploads an object', async () => {
          await makeUploadRequestAsync(credentials, DUMMY_OPTIONS, 'abc123', 'abc123-contents', {
            responseInit: {
              status: 200
            }
          });
        });

        it('Uploads an object to a different region', async () => {
          await makeUploadRequestAsync(
            credentials,
            { ...DUMMY_OPTIONS, s3Region: 'us-west-1' },
            'abc123',
            'abc123-contents',
            {
              responseInit: {
                status: 200
              }
            }
          );
        });

        it('Handles an unexpected error code', async () => {
          await runAndExpectErrorAsync(
            async () =>
              await makeUploadRequestAsync(credentials, DUMMY_OPTIONS, 'abc123', 'abc123-contents', {
                responseInit: {
                  status: 500,
                  statusText: 'Server Error'
                }
              })
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
