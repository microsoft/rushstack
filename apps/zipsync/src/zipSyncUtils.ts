// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReadonlyPathTrieNode } from '@rushstack/lookup-by-path/lib/LookupByPath';

export const METADATA_FILENAME: string = '__zipsync_metadata__.json';
export const METADATA_VERSION: string = '1.0';

export interface IDirQueueItem {
  dir: string;
  depth: number;
  node?: IReadonlyPathTrieNode<boolean> | undefined;
}

export interface IMetadataFileRecord {
  size: number;
  sha1Hash: string;
}

export interface IMetadata {
  version: string;
  files: Record<string, IMetadataFileRecord>;
}

export type IZipSyncMode = 'pack' | 'unpack';

export type ZipSyncOptionCompression = 'store' | 'deflate' | 'auto';
