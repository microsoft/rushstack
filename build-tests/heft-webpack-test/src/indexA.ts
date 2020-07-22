import(/* webpackChunkName: 'chunk' */ './chunks/chunk').then(({ ChunkClass }) => {
  const chunk = new ChunkClass();
  chunk.doStuff();
});
