// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InitialOptionsWithRootDir } from '@jest/types/build/Config';

/**
 * This Jest transform handles imports of data files (e.g. .png, .jpg) that would normally be
 * processed by a Webpack's file-loader. Instead of actually loading the resource, we return the file's name.
 * Webpack's file-loader normally returns the resource's URL, and the filename is an equivalent for a Node
 * environment.
 */
export function process(src: string, filename: string, jestOptions: InitialOptionsWithRootDir): string {
  // Double-escape "'" and "\" characters in the filename because this is going to be serialized
  // in a string in generated JS code, bounded by single quotes
  const escapedFilename: string = filename.replace(/\'/g, "\\'").replace(/\\/g, '\\\\');

  // For a file called "myImage.png", this will generate a JS module that exports the literal string "myImage.png"
  return `module.exports = '${escapedFilename}';`;
}
