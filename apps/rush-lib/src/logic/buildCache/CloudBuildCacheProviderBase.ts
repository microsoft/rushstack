// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';

export abstract class CloudBuildCacheProviderBase {
  public abstract readonly isCacheWriteAllowed: boolean;

  public abstract tryGetCacheEntryBufferByIdAsync(
    terminal: Terminal,
    cacheId: string
  ): Promise<Buffer | undefined>;
  public abstract trySetCacheEntryBufferAsync(
    terminal: Terminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<boolean>;
  public abstract updateCachedCredentialAsync(terminal: Terminal, credential: string): Promise<void>;
  public abstract updateCachedCredentialInteractiveAsync(terminal: Terminal): Promise<void>;
  public abstract deleteCachedCredentialsAsync(terminal: Terminal): Promise<void>;
}
