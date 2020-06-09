// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import decache from 'decache';

import { IPseudolocaleOptions } from './interfaces';

export class Pseudolocalization {
  public static getPseudolocalizer(options: IPseudolocaleOptions): (str: string) => string {
    // pseudolocale maintains static state, so we need to load it as isolated modules
    decache('pseudolocale');
    const pseudolocale = require('pseudolocale'); // eslint-disable-line

    pseudolocale.option = {
      ...pseudolocale.option,
      ...options,
    };
    return pseudolocale.str;
  }
}
