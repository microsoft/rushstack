import * as lodash from 'lodash';

import * as strings from './strings2.loc.json';
import { string1 } from '../strings1.loc.json';
import * as strings3 from '../strings3.loc.json';
import * as strings5 from '../strings5.resx';

export class ChunkWithStringsClass {
  public doStuff(): void {
    console.log(lodash.escape(strings.string1));
  }
}

console.log(string1);

console.log(strings3.string2);

console.log(strings5.string1);
console.log(strings5.stringWithQuotes);
console.log(strings5.stringWithTabsAndNewlines);
