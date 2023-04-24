// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/node-core-library';

/**
 * @beta
 */
export interface ICloudBuildCacheProvider {
  readonly isCacheWriteAllowed: boolean;

  tryGetCacheEntryBufferByIdAsync(terminal: ITerminal, cacheId: string): Promise<Buffer | undefined>;
  trySetCacheEntryBufferAsync(terminal: ITerminal, cacheId: string, entryBuffer: Buffer): Promise<boolean>;
  updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void>;
  updateCachedCredentialInteractiveAsync(terminal: ITerminal): Promise<void>;
  deleteCachedCredentialsAsync(terminal: ITerminal): Promise<void>;
}
