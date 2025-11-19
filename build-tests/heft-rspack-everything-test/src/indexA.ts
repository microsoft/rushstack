/* eslint-disable */
/* tslint:disable */
import(/* webpackChunkName: 'chunk' */ './chunks/ChunkClass')
  .then(({ ChunkClass }) => {
    const chunk: any = new ChunkClass();
    chunk.doStuff();
  })
  .catch((e) => {
    console.log('Error: ' + e.message);
  });
