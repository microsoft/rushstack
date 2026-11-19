// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks

import { SoundPlayer } from './SoundPlayer';

export class SoundPlayerConsumer {
  #soundPlayer: SoundPlayer;
  public constructor() {
    this.#soundPlayer = new SoundPlayer();
  }

  public playSomethingCool(): void {
    const coolSoundFileName: string = 'song.mp3';
    this.#soundPlayer.playSoundFile(coolSoundFileName);
  }
}
