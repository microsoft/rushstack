// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_SESSION_TOKEN,
  fromAmazonEnv,
  fromRushEnv
} from '../AmazonS3Credentials.ts';
import { EnvironmentConfiguration } from '@rushstack/rush-sdk';

describe('Amazon S3 Credentials', () => {
  describe(fromAmazonEnv.name, () => {
    let isOldEnvAwsAccessKeyIdSet: boolean;
    let oldEnvAwsAccessKeyId: string | undefined;
    let isOldEnvAwsSecretAccessKeySet: boolean;
    let oldEnvAwsSecretAccessKey: string | undefined;
    let isOldEnvAwsSessionTokenSet: boolean;
    let oldEnvAwsSessionToken: string | undefined;

    beforeEach(() => {
      isOldEnvAwsAccessKeyIdSet = AWS_ACCESS_KEY_ID in process.env;
      oldEnvAwsAccessKeyId = process.env[AWS_ACCESS_KEY_ID];
      isOldEnvAwsSecretAccessKeySet = AWS_SECRET_ACCESS_KEY in process.env;
      oldEnvAwsSecretAccessKey = process.env[AWS_SECRET_ACCESS_KEY];
      isOldEnvAwsSessionTokenSet = AWS_SESSION_TOKEN in process.env;
      oldEnvAwsSessionToken = process.env[AWS_SESSION_TOKEN];

      delete process.env[AWS_ACCESS_KEY_ID];
      delete process.env[AWS_SECRET_ACCESS_KEY];
      delete process.env[AWS_SESSION_TOKEN];
    });

    afterEach(() => {
      if (isOldEnvAwsAccessKeyIdSet) {
        process.env[AWS_ACCESS_KEY_ID] = oldEnvAwsAccessKeyId;
      } else {
        delete process.env[AWS_ACCESS_KEY_ID];
      }

      if (isOldEnvAwsSecretAccessKeySet) {
        process.env[AWS_SECRET_ACCESS_KEY] = oldEnvAwsSecretAccessKey;
      } else {
        delete process.env[AWS_SECRET_ACCESS_KEY];
      }

      if (isOldEnvAwsSessionTokenSet) {
        process.env[AWS_SESSION_TOKEN] = oldEnvAwsSessionToken;
      } else {
        delete process.env[AWS_SESSION_TOKEN];
      }
    });

    it('returns AWS vars when present in env', () => {
      process.env[AWS_ACCESS_KEY_ID] = AWS_ACCESS_KEY_ID;
      process.env[AWS_SECRET_ACCESS_KEY] = AWS_SECRET_ACCESS_KEY;
      process.env[AWS_SESSION_TOKEN] = AWS_SESSION_TOKEN;

      const credentials = fromAmazonEnv();

      expect(credentials).toBeDefined();
      expect(credentials!.accessKeyId).toBe(AWS_ACCESS_KEY_ID);
      expect(credentials!.secretAccessKey).toBe(AWS_SECRET_ACCESS_KEY);
      expect(credentials!.sessionToken).toBe(AWS_SESSION_TOKEN);
    });

    it('returns undefined sessionToken when not present', () => {
      process.env[AWS_ACCESS_KEY_ID] = AWS_ACCESS_KEY_ID;
      process.env[AWS_SECRET_ACCESS_KEY] = AWS_SECRET_ACCESS_KEY;

      const credentials = fromAmazonEnv();

      expect(credentials).toBeDefined();
      expect(credentials!.accessKeyId).toBe(AWS_ACCESS_KEY_ID);
      expect(credentials!.secretAccessKey).toBe(AWS_SECRET_ACCESS_KEY);
      expect(credentials!.sessionToken).toBeUndefined();
    });

    it('returns undefined if access key and secret are not both present', () => {
      process.env[AWS_ACCESS_KEY_ID] = AWS_ACCESS_KEY_ID;
      expect(() => fromAmazonEnv()).toThrowErrorMatchingInlineSnapshot(
        `"The \\"AWS_ACCESS_KEY_ID\\" env variable is set, but the \\"AWS_SECRET_ACCESS_KEY\\" env variable is not set. Both or neither must be provided."`
      );

      delete process.env[AWS_ACCESS_KEY_ID];
      process.env[AWS_SECRET_ACCESS_KEY] = AWS_SECRET_ACCESS_KEY;
      expect(() => fromAmazonEnv()).toThrowErrorMatchingInlineSnapshot(
        `"The \\"AWS_SECRET_ACCESS_KEY\\" env variable is set, but the \\"AWS_ACCESS_KEY_ID\\" env variable is not set. Both or neither must be provided."`
      );
    });
  });

  describe(fromRushEnv.name, () => {
    afterEach(() => {
      jest.resetAllMocks();
    });

    it('parses Rush build cache credential by default', () => {
      jest
        .spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get')
        .mockReturnValue('accessKey:secretKey');

      const credentials = fromRushEnv();

      expect(credentials).toBeDefined();
      expect(credentials!.accessKeyId).toBe('accessKey');
      expect(credentials!.secretAccessKey).toBe('secretKey');
      expect(credentials!.sessionToken).toBeUndefined();
    });

    it('allows passing cached credentials', () => {
      const credentials = fromRushEnv('accessKey:secretKey:sessionToken');

      expect(credentials).toBeDefined();
      expect(credentials!.accessKeyId).toBe('accessKey');
      expect(credentials!.secretAccessKey).toBe('secretKey');
      expect(credentials!.sessionToken).toBe('sessionToken');
    });

    it.each(['invalid', 'invalid:x:x:x'])('throws format error when "%s" is parsed', (credential) => {
      expect(() => fromRushEnv(credential)).toThrow('unexpected format');
    });
  });
});
