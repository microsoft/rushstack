// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

import { RushAmazonS3BuildCachePlugin } from './RushAmazonS3BuildCachePlugin.ts';

export { type IAmazonS3Credentials } from './AmazonS3Credentials.ts';
export { AmazonS3Client } from './AmazonS3Client.ts';
export default RushAmazonS3BuildCachePlugin;
export type {
  IAmazonS3BuildCacheProviderOptionsBase,
  IAmazonS3BuildCacheProviderOptionsAdvanced,
  IAmazonS3BuildCacheProviderOptionsSimple
} from './AmazonS3BuildCacheProvider.ts';
