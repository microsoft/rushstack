// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushAmazonS3BuildCachePlugin } from './RushAmazonS3BuildCachePlugin';

export { type IAmazonS3Credentials } from './AmazonS3Credentials';
export { AmazonS3Client } from './AmazonS3Client';
export default RushAmazonS3BuildCachePlugin;
export type {
  IAmazonS3BuildCacheProviderOptionsBase,
  IAmazonS3BuildCacheProviderOptionsAdvanced,
  IAmazonS3BuildCacheProviderOptionsSimple
} from './AmazonS3BuildCacheProvider';
