import strings from './strings2.loc.json';

export class ChunkWithStringsClass {
  public doStuff(): void {
    console.log(strings.string1);
  }
}
