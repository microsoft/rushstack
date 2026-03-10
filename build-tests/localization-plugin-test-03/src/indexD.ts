// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings')
  .then(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ({ ChunkWithoutStringsClass }) => {
      const chunk: import('./chunks/chunkWithoutStrings.ts').ChunkWithoutStringsClass =
        new ChunkWithoutStringsClass();
      chunk.doStuff();
    }
  )
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
  });
