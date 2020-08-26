// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks

export class SoundPlayer {
  private _foo: string;

  public constructor() {
    this._foo = 'bar';
  }

  public playSoundFile(fileName: string): void {
    console.log('Playing sound file ' + fileName);
    console.log('Foo=' + this._foo);
  }
}
