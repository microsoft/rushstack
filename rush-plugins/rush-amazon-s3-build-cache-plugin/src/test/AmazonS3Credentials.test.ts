// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_SESSION_TOKEN,
  fromAmazonEnv,
  fromRushEnv
} from '../AmazonS3Credentials';
import { EnvironmentConfiguration } from '@rushstack/rush-sdk';

describe('Amazon S3 Credentials', () => {
  describe(fromAmazonEnv.name, () => {
    let oldEnvAwsAccessKeyId: string | undefined;
    let oldEnvAwsSecretAccessKey: string | undefined;
    let oldEnvAwsSessionToken: string | undefined;
    
    beforeEach(() => {
      oldEnvAwsAccessKeyId = process.env[AWS_ACCESS_KEY_ID];
      oldEnvAwsSecretAccessKey = process.env[AWS_SECRET_ACCESS_KEY];
      oldEnvAwsSessionToken = process.env[AWS_SESSION_TOKEN];
      
      delete process.env[AWS_ACCESS_KEY_ID];
      delete process.env[AWS_SECRET_ACCESS_KEY];
      delete process.env[AWS_SESSION_TOKEN];
    });
    
    afterEach(() => {
      process.env[AWS_ACCESS_KEY_ID] = oldEnvAwsAccessKeyId;
      process.env[AWS_SECRET_ACCESS_KEY] = oldEnvAwsSecretAccessKey;
      process.env[AWS_SESSION_TOKEN] = oldEnvAwsSessionToken;
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
      expect(() => fromAmazonEnv()).toThrowErrorMatchingSnapshot();

      delete process.env[AWS_ACCESS_KEY_ID];
      process.env[AWS_SECRET_ACCESS_KEY] = AWS_SECRET_ACCESS_KEY;
      expect(() => fromAmazonEnv()).toThrowErrorMatchingSnapshot();
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
