// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Strongly typed trie data structure for path and URL-like strings.
 *
 * @packageDocumentation
 */

export type { IPrefixMatch, IReadonlyLookupByPath, IReadonlyPathTrieNode } from './LookupByPath';
export { LookupByPath } from './LookupByPath';
export type { IGetFirstDifferenceInCommonNodesOptions } from './getFirstDifferenceInCommonNodes';
export { getFirstDifferenceInCommonNodes } from './getFirstDifferenceInCommonNodes';
