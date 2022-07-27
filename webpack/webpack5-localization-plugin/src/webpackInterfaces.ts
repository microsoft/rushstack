// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Chunk, Compilation } from 'webpack';

/**
 * @public
 */
export interface ILocalizedWebpackChunk extends Chunk {
  localizedFiles?: { [locale: string]: string };
}

export type IAssetPathOptions = Parameters<typeof Compilation.prototype.getPath>[1] & {
  locale?: string;
};
