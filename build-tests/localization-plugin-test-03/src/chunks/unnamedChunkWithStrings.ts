import strings2 from './strings2.loc.json';
import strings6 from './strings6.resx';

export class UnnamedChunkWithStringsClass {
  public doStuff(): void {
    console.log(strings2.string1);
    console.log(strings6.string);
  }
}