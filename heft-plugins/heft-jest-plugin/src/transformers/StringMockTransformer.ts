// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { SyncTransformer, TransformedSource, TransformOptions } from '@jest/transform';

/**
 * This Jest transform handles imports of data files (e.g. .png, .jpg) that would normally be
 * processed by a Webpack's file-loader. Instead of actually loading the resource, we return the file's name.
 * Webpack's file-loader normally returns the resource's URL, and the filename is an equivalent for a Node
 * environment.
 */
export class StringMockTransformer implements SyncTransformer {
  public process(sourceText: string, sourcePath: string, options: TransformOptions): TransformedSource {
    // For a file called "myImage.png", this will generate a JS module that exports the literal string "myImage.png"
    return {
      code: `module.exports = ${JSON.stringify(sourcePath)};`
    };
  }
}
