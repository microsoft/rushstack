// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as lodash from 'lodash';

export class ChunkWithoutStringsClass {
  public doStuff(): void {
    // eslint-disable-next-line no-console
    console.log(lodash.escape('STATIC STRING'));
  }
}
