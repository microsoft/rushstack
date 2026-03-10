// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushPlugin, RushSession, RushConfiguration } from '@rushstack/rush-sdk';

import type {
  IAmazonS3BuildCacheProviderOptionsAdvanced,
  IAmazonS3BuildCacheProviderOptionsSimple
} from './AmazonS3BuildCacheProvider.ts';

const PLUGIN_NAME: string = 'AmazonS3BuildCachePlugin';

/**
 * @public
 */
export interface IAmazonS3ConfigurationJson {
  /**
   * (Required unless s3Endpoint is specified) The name of the bucket to use for build cache (e.g. "my-bucket").
   */
  s3Bucket?: string;

  /**
   * (Required unless s3Bucket is specified) The Amazon S3 endpoint of the bucket to use for build cache (e.g. "my-bucket.s3.us-east-2.amazonaws.com" or "http://localhost:9000").
   */
  s3Endpoint?: string;

  /**
   * The Amazon S3 region of the bucket to use for build cache (e.g. "us-east-1").
   */
  s3Region: string;

  /**
   * An optional prefix ("folder") for cache items.
   */
  s3Prefix?: string;

  /**
   * If set to true, allow writing to the cache. Defaults to false.
   */
  isCacheWriteAllowed?: boolean;
}

/**
 * @public
 */
export class RushAmazonS3BuildCachePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerCloudBuildCacheProviderFactory('amazon-s3', async (buildCacheConfig) => {
        type IBuildCache = typeof buildCacheConfig & {
          amazonS3Configuration: IAmazonS3ConfigurationJson;
        };
        const { amazonS3Configuration } = buildCacheConfig as IBuildCache;
        let options:
          | IAmazonS3BuildCacheProviderOptionsAdvanced
          | IAmazonS3BuildCacheProviderOptionsSimple
          | undefined;
        const { s3Endpoint, s3Bucket, s3Region } = amazonS3Configuration;
        const s3Prefix: undefined | string = amazonS3Configuration.s3Prefix || undefined;
        const isCacheWriteAllowed: boolean = !!amazonS3Configuration.isCacheWriteAllowed;

        if (s3Prefix && s3Prefix[0] === '/') {
          throw new Error('s3Prefix should not have a leading /');
        }

        // mutually exclusive
        if (s3Bucket && s3Endpoint) {
          throw new Error('Only one of "s3Bucket" or "s3Endpoint" must be provided.');
        }

        if (s3Endpoint) {
          options = {
            // IAmazonS3BuildCacheProviderOptionsAdvanced
            s3Region,
            s3Endpoint,
            s3Prefix,
            isCacheWriteAllowed
          };
        }
        if (s3Bucket) {
          options = {
            // IAmazonS3BuildCacheProviderOptionsSimple
            s3Region,
            s3Bucket,
            s3Prefix,
            isCacheWriteAllowed
          };
        }
        if (!options) {
          throw new Error('You must provide either an s3Endpoint or s3Bucket');
        }

        const { AmazonS3BuildCacheProvider } = await import('./AmazonS3BuildCacheProvider.ts');
        return new AmazonS3BuildCacheProvider(options, rushSession);
      });
    });
  }
}
