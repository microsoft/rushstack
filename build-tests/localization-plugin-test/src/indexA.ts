import { string1 } from './strings1.loc.json';
import * as strings2 from './strings3.loc.json';

console.log(string1);

console.log(strings2.string2);

import(/* webpackChunkName: 'chunk-with-strings' */ './chunks/chunkWithStrings').then(({ ChunkWithStringsClass }) => {
  const chunk = new ChunkWithStringsClass();
  chunk.doStuff();
});

import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings').then(({ ChunkWithoutStringsClass }) => {
  const chunk = new ChunkWithoutStringsClass();
  chunk.doStuff();
});
