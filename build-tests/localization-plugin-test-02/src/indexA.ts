import strings1 from './strings1.loc.json';
import strings3 from './strings3.resjson';
import strings5 from './strings5.resx';

console.log(strings1.string1);

console.log(strings3.string2);
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

// @ts-expect-error
import('non-existent').then(() => {
  // Do nothing.
});

console.log(strings5.string1);
console.log(strings5.stringWithQuotes);
console.log(strings5.stringWithTabsAndNewlines);
