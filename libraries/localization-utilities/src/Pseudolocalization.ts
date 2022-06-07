// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import vm from 'vm';
import { FileSystem } from '@rushstack/node-core-library';

import { IPseudolocaleOptions } from './interfaces';

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
  // eslint-disable-next-line @typescript-eslint/typedef
  const pseudolocaleCode: string = FileSystem.readFile(pseudolocalePath);
  const context: {
    pseudolocale: IPseudolocale | undefined;
  } = {
    pseudolocale: undefined
  };

  vm.runInNewContext(pseudolocaleCode, context);
  const { pseudolocale } = context;
  if (!pseudolocale) {
    throw new Error(`Failed to load pseudolocale module`);
  }

  Object.assign(pseudolocale.option, options);
  return pseudolocale.str;
}
