// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Import, JsonSchema } from '@rushstack/node-core-library';
import { IRushPlugin } from '../../pluginFramework/IRushPlugin';
import { RushSession } from '../../pluginFramework/RushSession';
import { RushConfiguration } from '../../api/RushConfiguration';

const AmazonS3BuildCacheProviderModule: typeof import('./AmazonS3BuildCacheProvider') = Import.lazy(
  '../logic/buildCache/AmazonS3/AmazonS3BuildCacheProvider',
  require
);
import type { AmazonS3BuildCacheProvider } from './AmazonS3BuildCacheProvider';

const PLUGIN_NAME: string = 'AmazonS3BuildCachePlugin';

export interface IAmazonS3ConfigurationJson {
  /**
   * The Amazon S3 region of the bucket to use for build cache (e.g. "us-east-1").
   */
  s3Region: string;

  /**
   * The name of the bucket in Amazon S3 to use for build cache.
   */
  s3Bucket: string;

  /**
   * An optional prefix ("folder") for cache items.
   */
  s3Prefix?: string;

  /**
   * If set to true, allow writing to the cache. Defaults to false.
   */
  isCacheWriteAllowed?: boolean;
}

class AmazonS3BuildCachePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, 'schemas', 'amazon-s3-config.schema.json')
  );

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.cloudCacheProviderFactories.set(
        'amazon-s3',
        (buildCacheConfig, buildCacheConfigFilePath: string): AmazonS3BuildCacheProvider => {
          AmazonS3BuildCachePlugin._jsonSchema.validateObject(buildCacheConfig, buildCacheConfigFilePath);
          type IBuildCache = typeof buildCacheConfig & { amazonS3Configuration: IAmazonS3ConfigurationJson };
          const { amazonS3Configuration } = buildCacheConfig as IBuildCache;
          return new AmazonS3BuildCacheProviderModule.AmazonS3BuildCacheProvider({
            s3Region: amazonS3Configuration.s3Region,
            s3Bucket: amazonS3Configuration.s3Bucket,
            s3Prefix: amazonS3Configuration.s3Prefix,
            isCacheWriteAllowed: !!amazonS3Configuration.isCacheWriteAllowed
          });
        }
      );
    });
  }
}

export default AmazonS3BuildCachePlugin;
