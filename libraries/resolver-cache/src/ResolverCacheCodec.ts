// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BinaryReader } from './BinaryReader';
import { BinaryWriter } from './BinaryWriter';
import { readStringTable, StringTableBuilder, writeStringTable } from './StringTable';
import {
  ResolverCacheHashAlgorithm,
  type IHashedResolverCacheFile,
  type IResolverCacheFile,
  type ISerializedResolveContext
} from './types';

/**
 * The first four bytes of every resolver cache binary file.
 *
 * @beta
 */
export const RESOLVER_CACHE_MAGIC: Uint8Array = new Uint8Array([0x52, 0x52, 0x43, 0x01]);

/**
 * The format version understood by this package.
 *
 * @beta
 */
export const RESOLVER_CACHE_FORMAT_VERSION: 1 = 1;

const FLAG_HAS_DIR_INFO: 1 = 1;
const FLAG_HAS_HASHES: 2 = 2;
const FLAG_SCOPED: 4 = 4;

const HASH_BYTE_LENGTHS: Record<ResolverCacheHashAlgorithm, number> = {
  [ResolverCacheHashAlgorithm.None]: 0,
  [ResolverCacheHashAlgorithm.Sha256]: 32
};

/**
 * Options for {@link encodeResolverCache}.
 *
 * @beta
 */
export interface IEncodeResolverCacheOptions {
  /**
   * The cache to encode.
   */
  cache: IResolverCacheFile;
  /**
   * Optional raw digest bytes for each context, parallel to `cache.contexts`.
   */
  hashes?: readonly Uint8Array[];
  /**
   * The algorithm that produced `hashes`. Required when `hashes` is supplied.
   */
  hashAlgorithm?: ResolverCacheHashAlgorithm;
  /**
   * True when this file contains only the slice of the graph visible to a single project, rather
   * than the whole workspace.
   */
  scoped?: boolean;
}

/**
 * Returns true if `buffer` begins with the resolver cache binary magic.
 *
 * @beta
 */
export function isResolverCacheBinary(buffer: Uint8Array): boolean {
  if (buffer.length < RESOLVER_CACHE_MAGIC.length) {
    return false;
  }
  for (let i: number = 0; i < RESOLVER_CACHE_MAGIC.length; ++i) {
    if (buffer[i] !== RESOLVER_CACHE_MAGIC[i]) {
      return false;
    }
  }
  return true;
}

function buildStringTable(contexts: readonly ISerializedResolveContext[]): StringTableBuilder {
  const builder: StringTableBuilder = new StringTableBuilder();
  for (const context of contexts) {
    builder.add(context.root);
    builder.add(context.name);
    if (context.deps) {
      for (const key of Object.keys(context.deps)) {
        builder.add(key);
      }
    }
    if (context.dirInfoFiles) {
      for (const file of context.dirInfoFiles) {
        builder.add(file);
      }
    }
  }
  return builder;
}

function writeContext(
  writer: BinaryWriter,
  builder: StringTableBuilder,
  context: ISerializedResolveContext,
  ordinal: number,
  hasDirInfo: boolean
): void {
  writer.writeVarint(builder.getIndex(context.root));
  writer.writeVarint(builder.getIndex(context.name));

  const depEntries: [number, number][] = [];
  if (context.deps) {
    for (const [key, targetOrdinal] of Object.entries(context.deps)) {
      depEntries.push([builder.getIndex(key), targetOrdinal]);
    }
    // Sorting by string index makes the key deltas monotonically increasing, which keeps them in
    // the single-byte varint range for all but the most extreme graphs.
    depEntries.sort((x: [number, number], y: [number, number]) => x[0] - y[0]);
  }

  writer.writeVarint(depEntries.length);
  let previousKeyIndex: number = 0;
  for (const [keyIndex, targetOrdinal] of depEntries) {
    writer.writeVarint(keyIndex - previousKeyIndex);
    previousKeyIndex = keyIndex;
    // Ordinals are assigned in sorted-root-path order, so dependencies are usually nearby.
    writer.writeSignedVarint(targetOrdinal - ordinal);
  }

  if (hasDirInfo) {
    const dirInfoFiles: string[] = context.dirInfoFiles ?? [];
    writer.writeVarint(dirInfoFiles.length);
    const indices: number[] = dirInfoFiles.map((file: string) => builder.getIndex(file)).sort(compareNumbers);
    let previousFileIndex: number = 0;
    for (const fileIndex of indices) {
      writer.writeVarint(fileIndex - previousFileIndex);
      previousFileIndex = fileIndex;
    }
  }
}

function compareNumbers(x: number, y: number): number {
  return x - y;
}

function readContext(
  reader: BinaryReader,
  strings: readonly string[],
  ordinal: number,
  hasDirInfo: boolean
): ISerializedResolveContext {
  const root: string = strings[reader.readVarint()];
  const name: string = strings[reader.readVarint()];

  const depCount: number = reader.readVarint();
  let deps: Record<string, number> | undefined;
  if (depCount > 0) {
    deps = {};
    let keyIndex: number = 0;
    for (let i: number = 0; i < depCount; ++i) {
      keyIndex += reader.readVarint();
      deps[strings[keyIndex]] = ordinal + reader.readSignedVarint();
    }
  }

  let dirInfoFiles: string[] | undefined;
  if (hasDirInfo) {
    const dirInfoCount: number = reader.readVarint();
    if (dirInfoCount > 0) {
      dirInfoFiles = new Array(dirInfoCount);
      let fileIndex: number = 0;
      for (let i: number = 0; i < dirInfoCount; ++i) {
        fileIndex += reader.readVarint();
        dirInfoFiles[i] = strings[fileIndex];
      }
    }
  }

  const context: ISerializedResolveContext = { root, name };
  if (deps) {
    context.deps = deps;
  }
  if (dirInfoFiles) {
    context.dirInfoFiles = dirInfoFiles;
  }
  return context;
}

/**
 * Encodes a resolver cache into the binary format.
 *
 * @beta
 */
export function encodeResolverCache(options: IEncodeResolverCacheOptions): Uint8Array {
  const { cache, hashes, scoped } = options;
  const { basePath, contexts } = cache;

  const hashAlgorithm: ResolverCacheHashAlgorithm =
    options.hashAlgorithm ?? (hashes ? ResolverCacheHashAlgorithm.Sha256 : ResolverCacheHashAlgorithm.None);
  const hashByteLength: number = HASH_BYTE_LENGTHS[hashAlgorithm];

  if (hashes) {
    if (hashAlgorithm === ResolverCacheHashAlgorithm.None) {
      throw new Error('A hash algorithm must be specified when hashes are provided');
    }
    if (hashes.length !== contexts.length) {
      throw new Error(
        `Expected ${contexts.length} hash(es) to match the context count, but received ${hashes.length}`
      );
    }
    for (const hash of hashes) {
      if (hash.length !== hashByteLength) {
        throw new Error(`Expected each hash to be ${hashByteLength} bytes, but received ${hash.length}`);
      }
    }
  }

  const hasDirInfo: boolean = contexts.some(
    (context: ISerializedResolveContext) => !!context.dirInfoFiles?.length
  );

  const builder: StringTableBuilder = buildStringTable(contexts);
  const strings: readonly string[] = builder.finalize();

  const writer: BinaryWriter = new BinaryWriter(64 * 1024);
  writer.writeBytes(RESOLVER_CACHE_MAGIC);
  writer.writeUint16(RESOLVER_CACHE_FORMAT_VERSION);
  writer.writeUint16(
    (hasDirInfo ? FLAG_HAS_DIR_INFO : 0) | (hashes ? FLAG_HAS_HASHES : 0) | (scoped ? FLAG_SCOPED : 0)
  );
  writer.writeUint8(hashes ? hashAlgorithm : ResolverCacheHashAlgorithm.None);

  writer.writeLengthPrefixedBytes(new TextEncoder().encode(basePath));
  writeStringTable(writer, strings);

  writer.writeVarint(contexts.length);
  for (let ordinal: number = 0; ordinal < contexts.length; ++ordinal) {
    writeContext(writer, builder, contexts[ordinal], ordinal, hasDirInfo);
  }

  if (hashes) {
    for (const hash of hashes) {
      writer.writeBytes(hash);
    }
  }

  return writer.toUint8Array();
}

/**
 * Decodes a buffer produced by {@link encodeResolverCache}.
 *
 * @beta
 */
export function decodeResolverCache(buffer: Uint8Array): IHashedResolverCacheFile {
  if (!isResolverCacheBinary(buffer)) {
    throw new Error('The buffer is not a resolver cache binary file');
  }

  const reader: BinaryReader = new BinaryReader(buffer);
  reader.readBytes(RESOLVER_CACHE_MAGIC.length);

  const formatVersion: number = reader.readUint16();
  if (formatVersion !== RESOLVER_CACHE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported resolver cache format version ${formatVersion}; expected ${RESOLVER_CACHE_FORMAT_VERSION}`
    );
  }

  const flags: number = reader.readUint16();
  const hasDirInfo: boolean = (flags & FLAG_HAS_DIR_INFO) !== 0;
  const hasHashes: boolean = (flags & FLAG_HAS_HASHES) !== 0;

  const hashAlgorithm: ResolverCacheHashAlgorithm = reader.readUint8();
  const hashByteLength: number | undefined = HASH_BYTE_LENGTHS[hashAlgorithm];
  if (hashByteLength === undefined) {
    throw new Error(`Unsupported resolver cache hash algorithm ${hashAlgorithm}`);
  }

  const basePath: string = new TextDecoder('utf-8', { fatal: true }).decode(
    reader.readLengthPrefixedBytes()
  );
  const strings: string[] = readStringTable(reader);

  const contextCount: number = reader.readVarint();
  const contexts: ISerializedResolveContext[] = new Array(contextCount);
  for (let ordinal: number = 0; ordinal < contextCount; ++ordinal) {
    contexts[ordinal] = readContext(reader, strings, ordinal, hasDirInfo);
  }

  const hashes: Uint8Array[] = [];
  if (hasHashes) {
    for (let i: number = 0; i < contextCount; ++i) {
      hashes.push(reader.readBytes(hashByteLength));
    }
  }

  return {
    basePath,
    contexts,
    hashAlgorithm: hasHashes ? hashAlgorithm : ResolverCacheHashAlgorithm.None,
    hashes
  };
}
