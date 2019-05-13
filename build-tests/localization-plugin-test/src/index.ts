import { string1 } from './strings1.loc.json';
import * as strings2 from './strings3.loc.json';

console.log(string1);

console.log(strings2.string2);

import(/* webpackChunkName: 'secondary-chunk' */ './secondaryChunk').then(({ SecondaryChunk }) => {
  const chunk = new SecondaryChunk();
  chunk.doStuff();
});
