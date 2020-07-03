import(/* webpackChunkName: 'chunk-with-strings' */ './chunks/chunkWithStrings').then(
  ({ ChunkWithStringsClass }) => {
    const chunk = new ChunkWithStringsClass();
    chunk.doStuff();
  }
);
