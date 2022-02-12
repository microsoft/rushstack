/*! Preserved comment */
//@preserve Another comment
// Blah @lic Foo
// Foo @cc_on bar
/**
 * Stuff
 * @lic Blah
 */

import(/* webpackChunkName: 'chunk-with-strings' */ './chunks/chunkWithStrings').then(
  ({ ChunkWithStringsClass }) => {
    const chunk = new ChunkWithStringsClass();
    chunk.doStuff();
  }
);

import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings').then(
  ({ ChunkWithoutStringsClass }) => {
    const chunk = new ChunkWithoutStringsClass();
    chunk.doStuff();
  }
);
