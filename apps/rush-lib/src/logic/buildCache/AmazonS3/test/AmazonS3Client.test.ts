// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IAmazonS3BuildCacheProviderOptions } from '../AmazonS3BuildCacheProvider';
import { AmazonS3Client, IAmazonS3Credentials } from '../AmazonS3Client';

const DUMMY_CREDENTIALS: IAmazonS3Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
};

const DUMMY_OPTIONS: Omit<IAmazonS3BuildCacheProviderOptions, 's3Bucket'> = {
  s3Region: 'us-east-1',
  isCacheWriteAllowed: true
};

describe('AmazonS3Client', () => {
  it('Rejects invalid S3 bucket names', () => {
    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: undefined!, ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: '-abc', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'a!bc', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'a', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: '10.10.10.10', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'abc..d', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'abc.-d', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'abc-.d', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'abc-', ...DUMMY_OPTIONS })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Accepts valid S3 bucket names', () => {
    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'abc123', ...DUMMY_OPTIONS })
    ).not.toThrow();

    expect(() => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'abc', ...DUMMY_OPTIONS })).not.toThrow();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'foo-bar-baz', ...DUMMY_OPTIONS })
    ).not.toThrow();

    expect(
      () => new AmazonS3Client(DUMMY_CREDENTIALS, { s3Bucket: 'foo.bar.baz', ...DUMMY_OPTIONS })
    ).not.toThrow();
  });
});
