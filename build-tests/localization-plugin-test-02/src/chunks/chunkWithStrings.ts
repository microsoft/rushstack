import * as lodash from 'lodash';

import strings from './strings2.loc.json';

export class ChunkWithStringsClass {
  public doStuff(): void {
    console.log(lodash.escape(strings.string1));
  }
}
