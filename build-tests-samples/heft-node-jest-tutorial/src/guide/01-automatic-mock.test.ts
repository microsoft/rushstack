// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks#automatic-mock

jest.mock('./SoundPlayer'); // SoundPlayer is now a mock constructor

import { SoundPlayer } from './SoundPlayer.ts';
import { SoundPlayerConsumer } from './SoundPlayerConsumer.ts';

beforeEach(() => {
  // Clear all instances and calls to constructor and all methods:
  mocked(SoundPlayer).mockClear();
});

it('We can check if the consumer called the class constructor', () => {
  new SoundPlayerConsumer();
  expect(SoundPlayer).toHaveBeenCalledTimes(1);
});

it('We can check if the consumer called a method on the class instance', () => {
  // Show that mockClear() is working:
  expect(SoundPlayer).not.toHaveBeenCalled();

  const soundPlayerConsumer: SoundPlayerConsumer = new SoundPlayerConsumer();
  // Constructor should have been called again:
  expect(SoundPlayer).toHaveBeenCalledTimes(1);

  const coolSoundFileName: string = 'song.mp3';
  soundPlayerConsumer.playSomethingCool();

  // mock.instances is available with automatic mocks:
  const mockSoundPlayerInstance: SoundPlayer = mocked(SoundPlayer).mock.instances[0];

  const mockPlaySoundFile = mocked(mockSoundPlayerInstance.playSoundFile);
  expect(mockPlaySoundFile.mock.calls[0][0]).toEqual(coolSoundFileName);

  // Equivalent to above check:
  expect(mockPlaySoundFile).toHaveBeenCalledWith(coolSoundFileName);
  expect(mockPlaySoundFile).toHaveBeenCalledTimes(1);
});
