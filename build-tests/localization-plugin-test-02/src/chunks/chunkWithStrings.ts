// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import strings from './strings2.loc.json';

function htmlEscape(str: string): string {
  return str.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
}

export class ChunkWithStringsClass {
  public doStuff(): void {
    // eslint-disable-next-line no-console
    console.log(htmlEscape(strings.string1));
  }
}
