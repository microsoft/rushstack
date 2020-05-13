import { string1 } from './strings1.loc.json';
import * as strings3 from './strings3.loc.json';
import * as strings5 from './strings5.resx';

console.log(string1);

console.log(strings3.string2);

import(/* webpackChunkName: 'chunk-with-strings' */ './chunks/chunkWithStrings').then(({ ChunkWithStringsClass }) => {
  const chunk = new ChunkWithStringsClass();
  chunk.doStuff();
});

import(/* webpackChunkName: 'chunk-without-strings' */ './chunks/chunkWithoutStrings').then(({ ChunkWithoutStringsClass }) => {
  const chunk = new ChunkWithoutStringsClass();
  chunk.doStuff();
});

console.log(strings5.string1);
console.log(strings5.stringWithQuotes);
console.log(strings5.stringWithTabsAndNewlines);
