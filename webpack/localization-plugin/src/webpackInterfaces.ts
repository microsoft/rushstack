import * as webpack from 'webpack';

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export interface ILocalizedWebpackChunk extends webpack.compilation.Chunk {
  localizedFiles?: { [locale: string]: string };
}
