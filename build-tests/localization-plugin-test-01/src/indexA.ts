import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings').then(
  ({ ChunkWithoutStringsClass }) => {
    const chunk = new ChunkWithoutStringsClass();
    chunk.doStuff();
  }
);
