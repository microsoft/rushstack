import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunk').then(({ ChunkClass }) => {
  const chunk = new ChunkClass();
  chunk.doStuff();
});
