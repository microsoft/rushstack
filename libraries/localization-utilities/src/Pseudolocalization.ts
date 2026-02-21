// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import vm from 'node:vm';

import { FileSystem } from '@rushstack/node-core-library';

import type { IPseudolocaleOptions } from './interfaces.ts';

const pseudolocalePath: string = require.resolve('pseudolocale/pseudolocale.min.js');

interface IPseudolocale {
  option: IPseudolocaleOptions;
  str(str: string): string;
}

/**
 * Get a function that pseudolocalizes a string.
 *
 * @public
 */
export function getPseudolocalizer(options: IPseudolocaleOptions): (str: string) => string {
  const pseudolocaleCode: string = FileSystem.readFile(pseudolocalePath);
  const context: {
    pseudolocale: IPseudolocale | undefined;
  } = {
    pseudolocale: undefined
  };

  // Load pseudolocale in an isolated context because the configuration for is stored on a singleton
  vm.runInNewContext(pseudolocaleCode, context);
  const { pseudolocale } = context;
  if (!pseudolocale) {
    throw new Error(`Failed to load pseudolocale module`);
  }

  Object.assign(pseudolocale.option, options);
  // `pseudolocale.str` captures `pseudolocale` in its closure and refers to `pseudolocale.option`.
  return pseudolocale.str;
}
