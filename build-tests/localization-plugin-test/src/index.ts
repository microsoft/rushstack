console.log('test');

import(/* webpackChunkName: 'secondary-chunk' */ './secondaryChunk').then(({ SecondaryChunk }) => {
  const chunk = new SecondaryChunk();
  chunk.doStuff();
});
