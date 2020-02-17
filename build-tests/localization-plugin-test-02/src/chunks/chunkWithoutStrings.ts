import * as lodash from 'lodash';

export class ChunkWithoutStringsClass {
  public doStuff(): void {
    console.log(lodash.escape('STATIC STRING'));
  }
}