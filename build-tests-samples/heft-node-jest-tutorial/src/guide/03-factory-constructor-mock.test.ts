// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks#complete-example

const mockPlaySoundFile = jest.fn();

jest.mock('./SoundPlayer', () => {
  return {
    SoundPlayer: jest.fn().mockImplementation(() => {
      return { playSoundFile: mockPlaySoundFile };
    })
  };
});

import { SoundPlayerConsumer } from './SoundPlayerConsumer.ts';
import { SoundPlayer } from './SoundPlayer.ts';

beforeEach(() => {
  mocked(SoundPlayer).mockClear();
  mockPlaySoundFile.mockClear();
});

it('The consumer should be able to call new() on SoundPlayer', () => {
  const soundPlayerConsumer = new SoundPlayerConsumer();
  // Ensure constructor created the object:
  expect(soundPlayerConsumer).toBeTruthy();
});

it('We can check if the consumer called the class constructor', () => {
  new SoundPlayerConsumer();
  expect(SoundPlayer).toHaveBeenCalledTimes(1);
});

it('We can check if the consumer called a method on the class instance', () => {
  const soundPlayerConsumer = new SoundPlayerConsumer();
  const coolSoundFileName: string = 'song.mp3';
  soundPlayerConsumer.playSomethingCool();
  expect(mockPlaySoundFile.mock.calls[0][0]).toEqual(coolSoundFileName);
});
