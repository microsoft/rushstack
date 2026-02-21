// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import strings1 from './strings1.loc.json';
import strings3 from './strings3.resjson';
import strings5 from './strings5.resx';

// eslint-disable-next-line no-console
console.log(strings1.string1);

// eslint-disable-next-line no-console
console.log(strings3.string2);
/*! Preserved comment */
//@preserve Another comment
// Blah @lic Foo
// Foo @cc_on bar
/**
 * Stuff
 * @lic Blah
 */

import(/* webpackChunkName: 'chunk-with-strings' */ './chunks/chunkWithStrings')
  // eslint-disable-next-line @typescript-eslint/naming-convention
  .then(({ ChunkWithStringsClass }) => {
    const chunk: import('./chunks/chunkWithStrings.ts').ChunkWithStringsClass = new ChunkWithStringsClass();
    chunk.doStuff();
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
  });

import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings')
  // eslint-disable-next-line @typescript-eslint/naming-convention
  .then(({ ChunkWithoutStringsClass }) => {
    const chunk: import('./chunks/chunkWithoutStrings.ts').ChunkWithoutStringsClass =
      new ChunkWithoutStringsClass();
    chunk.doStuff();
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
  });

// @ts-expect-error
import('non-existent')
  .then(() => {
    // Do nothing.
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
  });

// eslint-disable-next-line no-console
console.log(strings5.string1);
// eslint-disable-next-line no-console
console.log(strings5.stringWithQuotes);
// eslint-disable-next-line no-console
console.log(strings5.stringWithTabsAndNewlines);
