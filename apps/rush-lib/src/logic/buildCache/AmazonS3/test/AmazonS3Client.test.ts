// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IAmazonS3BuildCacheProviderOptions } from '../AmazonS3BuildCacheProvider';
import { AmazonS3Client } from '../AmazonS3Client';

const DUMMY_OPTIONS: Omit<IAmazonS3BuildCacheProviderOptions, 's3Bucket'> = {
  s3Region: 'us-east-1',
  isCacheWriteAllowed: true
};

describe('AmazonS3Client', () => {
  it('Rejects invalid S3 bucket names', () => {
    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: undefined!, ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: '-abc', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'a!bc', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'a', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: '10.10.10.10', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc..d', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc.-d', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc-.d', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(undefined, { s3Bucket: 'abc-', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Accepts valid S3 bucket names', () => {
    expect(() => new AmazonS3Client(undefined, { s3Bucket: 'abc123', ...DUMMY_OPTIONS })).not.toThrow();

    expect(() => new AmazonS3Client(undefined, { s3Bucket: 'abc', ...DUMMY_OPTIONS })).not.toThrow();

    expect(() => new AmazonS3Client(undefined, { s3Bucket: 'foo-bar-baz', ...DUMMY_OPTIONS })).not.toThrow();

    expect(() => new AmazonS3Client(undefined, { s3Bucket: 'foo.bar.baz', ...DUMMY_OPTIONS })).not.toThrow();
  });

  it('Does not allow upload without credentials', async () => {
    const client: AmazonS3Client = new AmazonS3Client(undefined, {
      s3Bucket: 'foo.bar.baz',
      ...DUMMY_OPTIONS
    });
    try {
      await client.uploadObjectAsync('temp', undefined!);
      fail('Expected an exception to be thrown');
    } catch (e) {
      expect(e).toMatchSnapshot();
    }
  });
});
