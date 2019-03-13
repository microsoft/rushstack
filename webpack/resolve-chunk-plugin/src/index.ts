// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is a webpack plugin that looks for calls to `resolveChunk` with a chunk name, and returns the
 * chunk ID. It's useful for referencing a chunk without making webpack coalesce two chunks.
 * @packageDocumentation
 */

export * from './ResolveChunkPlugin';
