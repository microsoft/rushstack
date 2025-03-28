// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import strings2 from './strings2.loc.json';
import strings6 from './strings6.resx';

export class UnnamedChunkWithStringsClass {
  public doStuff(): void {
    // eslint-disable-next-line no-console
    console.log(strings2.string1);
    // eslint-disable-next-line no-console
    console.log(strings6.string);
  }
}
