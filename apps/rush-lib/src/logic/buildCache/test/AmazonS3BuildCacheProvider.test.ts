// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration';
import { AmazonS3BuildCacheProvider } from '../AmazonS3BuildCacheProvider';

describe('AmazonS3BuildCacheProvider', () => {
  let buildCacheWriteCredentialEnvValue: string | undefined;

  beforeEach(() => {
    buildCacheWriteCredentialEnvValue = undefined;
    jest
      .spyOn(EnvironmentConfiguration, 'buildCacheWriteCredential', 'get')
      .mockImplementation(() => buildCacheWriteCredentialEnvValue);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("Isn't writable if isCacheWriteAllowed is set to false and there is no env write credential", () => {
    const cacheProvider: AmazonS3BuildCacheProvider = new AmazonS3BuildCacheProvider({
      s3Region: 'region-name',
      s3Bucket: 'container-name',
      isCacheWriteAllowed: false
    });

    expect(cacheProvider.isCacheWriteAllowed).toBe(false);
  });

  it('Is writable if isCacheWriteAllowed is set to true and there is no env write credential', () => {
    const cacheProvider: AmazonS3BuildCacheProvider = new AmazonS3BuildCacheProvider({
      s3Region: 'region-name',
      s3Bucket: 'container-name',
      isCacheWriteAllowed: true
    });

    expect(cacheProvider.isCacheWriteAllowed).toBe(true);
  });

  it('Is writable if isCacheWriteAllowed is set to false and there is an env write credential', () => {
    buildCacheWriteCredentialEnvValue = 'token';

    const cacheProvider: AmazonS3BuildCacheProvider = new AmazonS3BuildCacheProvider({
      s3Region: 'region-name',
      s3Bucket: 'container-name',
      isCacheWriteAllowed: false
    });

    expect(cacheProvider.isCacheWriteAllowed).toBe(true);
  });
});
