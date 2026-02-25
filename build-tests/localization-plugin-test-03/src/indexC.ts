// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
