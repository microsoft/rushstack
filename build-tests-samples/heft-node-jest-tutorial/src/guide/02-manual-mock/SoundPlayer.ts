// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks

export class SoundPlayer {
  private _foo: string;

  public constructor() {
    this._foo = 'bar';
  }

  public playSoundFile(fileName: string): void {
    // eslint-disable-next-line no-console
    console.log('Playing sound file ' + fileName);
    // eslint-disable-next-line no-console
    console.log('Foo=' + this._foo);
  }
}
