// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Response, ResponseInit } from 'node-fetch';

import { IAmazonS3BuildCacheProviderOptions } from '../AmazonS3BuildCacheProvider';
import { AmazonS3Client, IAmazonS3Credentials } from '../AmazonS3Client';
import { WebClient } from '../WebClient';

const webClient = new WebClient();

const DUMMY_OPTIONS_WITHOUT_BUCKET: Omit<IAmazonS3BuildCacheProviderOptions, 's3Bucket'> = {
  s3Region: 'us-east-1',
  isCacheWriteAllowed: true
};

const DUMMY_OPTIONS: IAmazonS3BuildCacheProviderOptions = {
  ...DUMMY_OPTIONS_WITHOUT_BUCKET,
  s3Bucket: 'test-s3-bucket'
};

class MockedDate extends Date {
  public constructor() {
    super(2020, 3, 18, 12, 32, 42, 493);
  }

  public toISOString(): string {
    return '2020-04-18T12:32:42.493Z';
  }
}

describe('AmazonS3Client', () => {
  it('Rejects invalid S3 bucket names', () => {
    expect(
      () =>
        new AmazonS3Client(undefined, { s3Bucket: undefined!, ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: '-abc', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'a!bc', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'a', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new AmazonS3Client(undefined, { s3Bucket: '10.10.10.10', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc..d', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc.-d', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc-.d', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc-', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).toThrowErrorMatchingSnapshot();
  });

  it('Accepts valid S3 bucket names', () => {
    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc123', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).not.toThrow();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).not.toThrow();

    expect(
      () =>
        new AmazonS3Client(undefined, { s3Bucket: 'foo-bar-baz', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).not.toThrow();

    expect(
      () =>
        new AmazonS3Client(undefined, { s3Bucket: 'foo.bar.baz', ...DUMMY_OPTIONS_WITHOUT_BUCKET }, webClient)
    ).not.toThrow();
  });

  it('Does not allow upload without credentials', async () => {
    const client: AmazonS3Client = new AmazonS3Client(
      undefined,
      {
        s3Bucket: 'foo.bar.baz',
        ...DUMMY_OPTIONS_WITHOUT_BUCKET
      },
      webClient
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
      options: IAmazonS3BuildCacheProviderOptions,
      request: (s3Client: AmazonS3Client) => Promise<TResponse>,
      response: IResponseOptions
    ): Promise<TResponse> {
      const spy: jest.SpyInstance = jest
        .spyOn(WebClient.prototype, 'fetchAsync')
        .mockReturnValue(Promise.resolve(new Response(response.body, response.responseInit)));

      const s3Client: AmazonS3Client = new AmazonS3Client(credentials, options, webClient);
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
        options: IAmazonS3BuildCacheProviderOptions,
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
        options: IAmazonS3BuildCacheProviderOptions,
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
});
