// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings')
  // eslint-disable-next-line @typescript-eslint/naming-convention
  .then(({ ChunkWithoutStringsClass }) => {
    const chunk: import('./chunks/chunkWithoutStrings.ts').ChunkWithoutStringsClass =
      new ChunkWithoutStringsClass();
    chunk.doStuff();
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.log(error);
  });
